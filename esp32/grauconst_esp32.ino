// ============================================================
//  GRAUCONST — ESP32 + DHT22 + Inkbird IBS-TH2 + Deep Sleep
//
//  Envia: temperatura, umidade, rssi, bateria_pct (0-100%)
//         e dados do sensor Inkbird IBS-TH2 se detectado.
//  Intervalo: 15 minutos via Deep Sleep
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
// #include <ArduinoJson.h>  // REMOVIDO - JSON manual com sprintf
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

#include "secrets.h"
// #include "supabase_ca.h"  // Removido - não precisa com HTTP
#include "inkbird_decoder.h"

// ── Sensor DHT22 ─────────────────────────────────────────────
#define DHT_PIN   4
#define DHT_TYPE  DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ── BLE Scan ─────────────────────────────────────────────────
#define BLE_SCAN_TIME 5 // segundos
BLEScan* pBLEScan;
InkbirdData globalInkbird;
bool inkbirdFound = false;

// ── Deep Sleep: 15 minutos ───────────────────────────────────
#define SLEEP_US  (15ULL * 60ULL * 1000000ULL)

// ── Timeouts ─────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS  15000
#define HTTP_TIMEOUT_MS  10000

// ── ADC bateria ──────────────────────────────────────────────
#define BAT_MAX_V   4.2f
#define BAT_MIN_V   3.0f
#define ADC_VREF    3.3f
#define ADC_MAX     4095.0f
#ifndef BATTERY_DIVIDER
  #define BATTERY_DIVIDER 2.0f   // padrão R1=R2 (=100kΩ + 100kΩ)
#endif

// ── Buffer ───────────────────────────────────────────────────
#define BUFFER_MAX  50           // até 50 leituras (~12.5h offline)
#define BUFFER_NS   "graubuf"    // namespace NVS

// ── Boot counter (sobrevive ao deep sleep, perde em power-off)
RTC_DATA_ATTR int bootCount = 0;

// ── Cliente HTTP ──────────────────────────────────────────────────
String sensorId;   // resolvido em setup() — SENSOR_ID ou ESP32-<MAC>

// ── Protótipos ───────────────────────────────────────────────
String  gerarSensorId();
bool    conectarWiFi();
float   lerBateria_pct();
String  montarPayload(float t, float u, int rssi, float bat, InkbirdData ink);
bool    enviarLeitura(const String& payload);
void    dormirAgora();

// ── BLE Callback ─────────────────────────────────────────────
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        if (advertisedDevice.haveManufacturerData()) {
            String mData = advertisedDevice.getManufacturerData();
            uint8_t* data = (uint8_t*)mData.c_str();
            size_t len = mData.length();
            
            // Verifica se é um dispositivo Inkbird (ID 0x48 0x43 ou nome "sps" / "tps")
            // IBS-TH2 costuma ter o nome "tps" ou "sps"
            String name = advertisedDevice.getName().c_str();
            if (name.indexOf("tps") != -1 || name.indexOf("sps") != -1 || (len >= 2 && data[0] == 0x48 && data[1] == 0x43)) {
                InkbirdData decoded = InkbirdDecoder::decode(data, len);
                if (decoded.success) {
                    globalInkbird = decoded;
                    inkbirdFound = true;
                    Serial.printf("[INKBIRD] Detectado! T: %.1f°C | H: %.1f%% | Bat: %d%%\n", 
                                  decoded.temperature, decoded.humidity, decoded.battery);
                }
            }
        }
    }
};

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  bootCount++;
  Serial.printf("\n[GRAUCONST] Boot #%d | FW %s\n", bootCount, FIRMWARE_VERSION);

  // sensor_id precisa do MAC (mesmo offline) — exige WiFi mode STA
  WiFi.mode(WIFI_STA);
  sensorId = gerarSensorId();
  Serial.printf("[ID] %s\n", sensorId.c_str());

  // ── Leitura Sensores Locais ──
  dht.begin();
  delay(2000);
  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[AVISO] Falha na leitura do DHT22. Tentando seguir com outros dados...");
  } else {
    Serial.printf("[SENSOR] Temp: %.1f°C | Umid: %.1f%%\n", temperatura, umidade);
  }

  // ── Scan BLE para Inkbird ──
  Serial.println("[BLE] Iniciando scan para Inkbird IBS-TH2...");
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  pBLEScan->start(BLE_SCAN_TIME, false);
  
  if (!inkbirdFound) {
      Serial.println("[BLE] Inkbird não encontrado neste ciclo.");
  }

  float bat_pct = lerBateria_pct();
  if (!isnan(bat_pct)) {
    Serial.printf("[BAT] %.0f%%\n", bat_pct);
  }

  // BUFFER DESATIVADO para economizar espaço
  // bufPrefs.begin(BUFFER_NS, false);
  // int pendentes = bufferCount();
  // if (pendentes > 0) Serial.printf("[BUF] %d leitura(s) pendente(s)\n", pendentes);

  if (!conectarWiFi()) {
    // Sem WiFi: apenas dorme (buffer desativado)
    Serial.println("[WiFi] Falha; dormindo...");
    dormirAgora();
    return;
  }

  int rssi = WiFi.RSSI();
  Serial.printf("[WiFi] RSSI: %d dBm\n", rssi);

  // ── OTA check ──
  // OTA desativado para reduzir tamanho do firmware
  // #ifdef OTA_VERSION_URL
  // if (bootCount % OTA_CHECK_EVERY_N_BOOTS == 1) {
  //   talvezAtualizarOTA();
  // }
  // #endif

  // ── Envia leitura ──
  String payload = montarPayload(temperatura, umidade, rssi, bat_pct, globalInkbird);
  if (!enviarLeitura(payload)) {
    Serial.println("[ERRO] Envio falhou; continuando...");
  }

  // bufPrefs.end();  // DESATIVADO
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  dormirAgora();
}

void loop() {}

// ── sensor_id: SENSOR_ID se definido em secrets.h, senão ESP32-<MAC>
String gerarSensorId() {
  String override_id = String(SENSOR_ID);
  override_id.trim();
  if (override_id.length() > 0) return override_id;
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return "ESP32-" + mac;
}

// ── Bateria ──
float lerBateria_pct() {
#ifdef BATTERY_PIN
  int soma = 0;
  for (int i = 0; i < 10; i++) { soma += analogRead(BATTERY_PIN); delay(5); }
  float raw = soma / 10.0f;
  float v_adc  = (raw / ADC_MAX) * ADC_VREF;
  float v_real = v_adc * BATTERY_DIVIDER;
  float pct = ((v_real - BAT_MIN_V) / (BAT_MAX_V - BAT_MIN_V)) * 100.0f;
  if (pct > 100.0f) pct = 100.0f;
  if (pct < 0.0f)   pct = 0.0f;
  return pct;
#else
  return NAN;
#endif
}

// ── WiFi ──
bool conectarWiFi() {
  Serial.printf("[WiFi] Conectando a %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t > WIFI_TIMEOUT_MS) {
      Serial.println("\n[WiFi] Timeout!");
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// ── Payload JSON (manual, sem ArquinoJson) ──
String montarPayload(float temperatura, float umidade, int rssi, float bat_pct, InkbirdData ink) {
  char buf[512];
  snprintf(buf, sizeof(buf),
    "{\"sensor_id\":\"%s\""
    ",\"temperatura\":%s"
    ",\"umidade\":%s"
    ",\"rssi\":%d"
    ",\"bateria_pct\":%s"
    ",\"inkbird_temp\":%s"
    ",\"inkbird_hum\":%s"
    ",\"inkbird_bat\":%d"
    "}",
    sensorId.c_str(),
    !isnan(temperatura) ? String(temperatura, 1).c_str() : "null",
    !isnan(umidade) ? String(umidade, 1).c_str() : "null",
    rssi,
    !isnan(bat_pct) && bat_pct >= 0 && bat_pct <= 100 ? String((int)bat_pct).c_str() : "null",
    !isnan(ink.temperature) ? String(ink.temperature, 1).c_str() : "null",
    !isnan(ink.humidity) ? String(ink.humidity, 1).c_str() : "null",
    ink.battery
  );
  return String(buf);
}

// ── POST sensor-ingest ──
bool enviarLeitura(const String& payload) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";
  url.replace("https://", "http://");
  if (!http.begin(url)) {
    Serial.println("[HTTP] begin() falhou");
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type",   "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  Serial.printf("[HTTP] → %s\n", payload.c_str());
  int code = http.POST(payload);
  Serial.printf("[HTTP] ← %d\n", code);
  http.end();
  return (code == 201 || code == 200);
}



// ── Deep sleep ──
void dormirAgora() {
  Serial.println("[SLEEP] Dormindo 15 min... 💤");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
