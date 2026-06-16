// ============================================================
//  GRAUCONST — ESP32 + Inkbird IBS-TH2 (BLE) + Deep Sleep
//
//  Envia: temperatura, umidade, rssi,
//         inkbird_bat (% bateria do Inkbird via BLE),
//         esp32_bat_pct (% bateria do pack 2S via divisor GPIO34)
//  Intervalo: 15 minutos via Deep Sleep
// ============================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <ArduinoJson.h>

#include "secrets.h"
#include "supabase_ca.h"
#include "inkbird_decoder.h"

// ── Firmware version ─────────────────────────────────────────
#define FIRMWARE_VERSION  "1.2.0"

// ── BLE Scan ─────────────────────────────────────────────────
BLEScan* pBLEScan;
InkbirdData globalInkbird;
bool inkbirdFound = false;

// ── Deep Sleep: 15 minutos ───────────────────────────────────
#define SLEEP_US  (15ULL * 60ULL * 1000000ULL)

// ── Timeouts ─────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS  15000
#define HTTP_TIMEOUT_MS  10000

// ── Boot counter ─────────────────────────────────────────────
RTC_DATA_ATTR int bootCount = 0;

// ── Clientes ─────────────────────────────────────────────────
WiFiClientSecure secureClient;
WiFiMulti wifiMulti;
String sensorId;

// ── Protótipos ───────────────────────────────────────────────
String  gerarSensorId();
bool    conectarWiFi();
void    configurarTLS();
int     lerBateriaEsp32();
String  montarPayload(int rssi, InkbirdData ink, int esp32BatPct);
bool    enviarLeitura(const String& payload);
void    dormirAgora();

// ── BLE Callback ─────────────────────────────────────────────
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        if (!advertisedDevice.haveManufacturerData()) return;

        String mData = advertisedDevice.getManufacturerData();
        uint8_t* data = (uint8_t*)mData.c_str();
        size_t len = mData.length();

#ifdef INKBIRD_MAC
        String addr = String(advertisedDevice.getAddress().toString().c_str());
        addr.toLowerCase();
        String alvo = String(INKBIRD_MAC);
        alvo.toLowerCase();
        bool pareceInkbird = (addr == alvo);
#else
        String name = String(advertisedDevice.getName().c_str());
        name.toLowerCase();
        bool pareceInkbird = name.indexOf("tps") != -1 || name.indexOf("sps") != -1 ||
                             (len >= 7 && data[0] == 0x48 && data[1] == 0x43);
#endif
        if (!pareceInkbird) return;

        InkbirdData decoded = InkbirdDecoder::decode(data, len);
        if (decoded.success) {
            globalInkbird = decoded;
            inkbirdFound = true;
            Serial.printf("[INKBIRD] T: %.1f°C | H: %.1f%% | Bat: %d%%\n",
                          decoded.temperature, decoded.humidity, decoded.battery);
        }
    }
};

// ── Leitura da bateria do ESP32 (pack 2S via divisor resistivo) ──
// Divisor: VCC_BAT ── 100kΩ ── GPIO34 ── 47kΩ ── GND
// Tensão no pino = Vbat × 47/(100+47) = Vbat × 0.3197
// Pack 2S Li-ion: 8.4V cheio (2×4.2V), 6.0V vazio (2×3.0V)
int lerBateriaEsp32() {
#ifndef BATTERY_PIN
  return -1;   // Não configurado — retorna -1 (será omitido do payload)
#else
  const float R1 = 100000.0f;
  const float R2 =  47000.0f;
  const float VREF   = 3.3f;
  const float ADC_MAX = 4095.0f;

  // Média de 10 amostras para reduzir ruído do ADC
  long soma = 0;
  for (int i = 0; i < 10; i++) {
    soma += analogRead(BATTERY_PIN);
    delay(5);
  }
  float adcRaw = soma / 10.0f;

  // Tensão no pino ADC
  float vPin = (adcRaw / ADC_MAX) * VREF;

  // Tensão real da bateria (reconstituída pelo divisor)
  float vBat = vPin * (R1 + R2) / R2;

  // Limites do pack 2S (Li-ion)
  const float VMAX = 8.4f;
  const float VMIN = 6.0f;

  int pct = (int)(((vBat - VMIN) / (VMAX - VMIN)) * 100.0f);
  pct = constrain(pct, 0, 100);

  Serial.printf("[BAT-ESP32] ADC: %.0f | Vpin: %.3fV | Vbat: %.2fV | %d%%\n",
                adcRaw, vPin, vBat, pct);
  return pct;
#endif
}

void setup() {
  Serial.begin(115200);
  delay(500);
  bootCount++;
  Serial.printf("\n[GRAUCONST] Boot #%d | FW %s\n", bootCount, FIRMWARE_VERSION);

  WiFi.mode(WIFI_STA);
  delay(100);
  sensorId = gerarSensorId();
  Serial.printf("[ID] %s\n", sensorId.c_str());

  // ── Lê bateria do ESP32 ANTES do WiFi/BLE (tensão mais estável) ──
  int esp32BatPct = lerBateriaEsp32();

  Serial.printf("[BLE] Scan (%ds)...\n", BLE_SCAN_TIME);
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  pBLEScan->start(BLE_SCAN_TIME, false);

  if (!inkbirdFound) {
    Serial.println("[BLE] Inkbird não encontrado.");
  }

  if (!conectarWiFi()) {
    Serial.println("[WiFi] Falha; dormindo...");
    dormirAgora();
    return;
  }

  int rssi = WiFi.RSSI();
  Serial.printf("[WiFi] RSSI: %d dBm\n", rssi);

  configurarTLS();

  if (inkbirdFound) {
    String payload = montarPayload(rssi, globalInkbird, esp32BatPct);
    if (!enviarLeitura(payload)) {
      Serial.println("[ERRO] Envio falhou.");
    }
  } else {
    Serial.println("[AVISO] Sem dados Inkbird para enviar.");
  }

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  dormirAgora();
}

void loop() {}

String gerarSensorId() {
  String override_id = String(SENSOR_ID);
  override_id.trim();
  if (override_id.length() > 0) return override_id;
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macStr[13];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return "ESP32-" + String(macStr);
}

bool conectarWiFi() {
  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);
#ifdef WIFI_SSID2
  wifiMulti.addAP(WIFI_SSID2, WIFI_PASSWORD2);
#endif
#ifdef WIFI_SSID3
  wifiMulti.addAP(WIFI_SSID3, WIFI_PASSWORD3);
#endif
  Serial.println("[WiFi] Conectando...");
  unsigned long t = millis();
  while (wifiMulti.run() != WL_CONNECTED) {
    if (millis() - t > WIFI_TIMEOUT_MS) {
      Serial.println("\n[WiFi] Timeout!");
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] OK — \"%s\" | IP: %s\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  return true;
}

void configurarTLS() {
  secureClient.setInsecure();
}

String montarPayload(int rssi, InkbirdData ink, int esp32BatPct) {
  JsonDocument doc;
  doc["sensor_id"]    = sensorId;
  doc["rssi"]         = rssi;
  doc["inkbird_temp"] = ink.temperature;
  doc["inkbird_hum"]  = ink.humidity;
  doc["inkbird_bat"]  = ink.battery;
  doc["temperatura"]  = nullptr;
  doc["umidade"]      = nullptr;
  doc["bateria_pct"]  = nullptr;

  // Bateria do ESP32 (pack 2S via GPIO34)
  // esp32BatPct == -1 significa BATTERY_PIN não definido → omite do JSON
  if (esp32BatPct >= 0) {
    doc["esp32_bat_pct"] = esp32BatPct;
  } else {
    doc["esp32_bat_pct"] = nullptr;
  }

  String out;
  serializeJson(doc, out);
  return out;
}

bool enviarLeitura(const String& payload) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";
  if (!http.begin(secureClient, url)) return false;

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  Serial.printf("[HTTP] → %s\n", payload.c_str());
  int code = http.POST(payload);
  Serial.printf("[HTTP] ← %d\n", code);
  http.end();
  return (code == 201 || code == 200);
}

void dormirAgora() {
  Serial.println("[SLEEP] 15 min... 💤");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
