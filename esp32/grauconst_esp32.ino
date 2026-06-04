// ============================================================
//  GRAUCONST — ESP32 + DHT22 + Inkbird IBS-TH2 + Deep Sleep
//
//  Envia: temperatura, umidade, rssi, bateria_pct (0-100%)
//         e dados do sensor Inkbird IBS-TH2 se detectado.
//  Intervalo: 15 minutos via Deep Sleep
// ============================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <Preferences.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

#include "secrets.h"
#include "supabase_ca.h"
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

// ── Cliente HTTPS compartilhado ──────────────────────────────
WiFiClientSecure secureClient;
Preferences bufPrefs;
String sensorId;   // resolvido em setup() — SENSOR_ID ou ESP32-<MAC>

// ── Protótipos ───────────────────────────────────────────────
String  gerarSensorId();
bool    conectarWiFi();
void    configurarTLS();
float   lerBateria_pct();
String  montarPayload(float t, float u, int rssi, float bat, InkbirdData ink);
bool    enviarLeitura(const String& payload);
void    bufferPush(const String& payload);
String  bufferPeek();
void    bufferPopFirst();
int     bufferCount();
void    drenarBuffer();
void    talvezAtualizarOTA();
void    dormirAgora();

// ── BLE Callback ─────────────────────────────────────────────
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        if (advertisedDevice.haveManufacturerData()) {
            std::string mData = advertisedDevice.getManufacturerData();
            uint8_t* data = (uint8_t*)mData.data();
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

  bufPrefs.begin(BUFFER_NS, false);
  int pendentes = bufferCount();
  if (pendentes > 0) Serial.printf("[BUF] %d leitura(s) pendente(s)\n", pendentes);

  if (!conectarWiFi()) {
    // Sem WiFi: salva no buffer e dorme.
    int rssi = 0;
    String payload = montarPayload(temperatura, umidade, rssi, bat_pct, globalInkbird);
    bufferPush(payload);
    Serial.printf("[BUF] Salvo na flash. Total pendente: %d\n", bufferCount());
    bufPrefs.end();
    dormirAgora();
    return;
  }

  int rssi = WiFi.RSSI();
  Serial.printf("[WiFi] RSSI: %d dBm\n", rssi);

  configurarTLS();

  // ── OTA check ──
#ifdef OTA_VERSION_URL
  if (bootCount % OTA_CHECK_EVERY_N_BOOTS == 1) {
    talvezAtualizarOTA();
  }
#endif

  // ── Drena buffer primeiro, depois envia leitura atual ──
  drenarBuffer();

  String payload = montarPayload(temperatura, umidade, rssi, bat_pct, globalInkbird);
  if (!enviarLeitura(payload)) {
    Serial.println("[ERRO] Envio falhou; salvando no buffer.");
    bufferPush(payload);
  }

  bufPrefs.end();
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

// ── TLS ──
void configurarTLS() {
#ifdef SKIP_TLS_VERIFY
  Serial.println("[TLS] Modo inseguro (sem validação de cert).");
  secureClient.setInsecure();
#else
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t now = 0;
  unsigned long t = millis();
  while (now < 1700000000 && millis() - t < 5000) {
    delay(200);
    now = time(nullptr);
  }
  if (now < 1700000000) {
    Serial.println("[TLS] NTP falhou; caindo em modo inseguro.");
    secureClient.setInsecure();
  } else {
    secureClient.setCACert(SUPABASE_ROOT_CA);
  }
#endif
}

// ── Payload JSON ──
String montarPayload(float temperatura, float umidade, int rssi, float bat_pct, InkbirdData ink) {
  JsonDocument doc;
  doc["sensor_id"]   = sensorId;
  
  // Dados do DHT22 (se válidos)
  if (!isnan(temperatura)) doc["temperatura"] = temperatura;
  if (!isnan(umidade)) doc["umidade"]     = umidade;
  
  // Dados do Inkbird (se detectado)
  if (ink.success) {
      doc["inkbird_temp"] = ink.temperature;
      doc["inkbird_hum"]  = ink.humidity;
      doc["inkbird_bat"]  = ink.battery;
  }
  
  if (rssi != 0) doc["rssi"] = rssi;
  if (!isnan(bat_pct)) doc["bateria_pct"] = (int)bat_pct;

  String out;
  serializeJson(doc, out);
  return out;
}

// ── POST sensor-ingest ──
bool enviarLeitura(const String& payload) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";
  if (!http.begin(secureClient, url)) {
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

// ── Buffer FIFO em NVS ──
int bufferCount() {
  return (int)bufPrefs.getUInt("count", 0);
}

void bufferPush(const String& payload) {
  int head  = (int)bufPrefs.getUInt("head", 0);
  int count = bufferCount();
  int slot  = (head + count) % BUFFER_MAX;
  char key[8]; snprintf(key, sizeof(key), "r%d", slot);
  bufPrefs.putString(key, payload);
  if (count >= BUFFER_MAX) {
    bufPrefs.putUInt("head", (head + 1) % BUFFER_MAX);
  } else {
    bufPrefs.putUInt("count", count + 1);
  }
}

String bufferPeek() {
  if (bufferCount() == 0) return "";
  int head = (int)bufPrefs.getUInt("head", 0);
  char key[8]; snprintf(key, sizeof(key), "r%d", head);
  return bufPrefs.getString(key, "");
}

void bufferPopFirst() {
  int count = bufferCount();
  if (count == 0) return;
  int head = (int)bufPrefs.getUInt("head", 0);
  char key[8]; snprintf(key, sizeof(key), "r%d", head);
  bufPrefs.remove(key);
  bufPrefs.putUInt("head", (head + 1) % BUFFER_MAX);
  bufPrefs.putUInt("count", count - 1);
}

void drenarBuffer() {
  int pendentes = bufferCount();
  if (pendentes == 0) return;
  Serial.printf("[BUF] Drenando %d leitura(s)...\n", pendentes);
  while (bufferCount() > 0) {
    String p = bufferPeek();
    if (p.length() == 0) { bufferPopFirst(); continue; }
    if (!enviarLeitura(p)) {
      Serial.println("[BUF] Envio falhou; abortando dreno.");
      return;
    }
    bufferPopFirst();
  }
  Serial.println("[BUF] Buffer vazio.");
}

// ── OTA ──
#ifdef OTA_VERSION_URL
void talvezAtualizarOTA() {
  Serial.println("[OTA] Checando versão remota...");
  HTTPClient http;
  if (!http.begin(secureClient, OTA_VERSION_URL)) {
    Serial.println("[OTA] begin() falhou.");
    return;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[OTA] version.json ← %d (sem update)\n", code);
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("[OTA] JSON inválido.");
    return;
  }
  const char* remoteVersion = doc["version"] | "";
  const char* remoteUrl     = doc["url"]     | "";

  if (strlen(remoteVersion) == 0 || strlen(remoteUrl) == 0) {
    Serial.println("[OTA] version.json sem campos esperados.");
    return;
  }
  if (strcmp(remoteVersion, FIRMWARE_VERSION) == 0) {
    Serial.printf("[OTA] Já estamos em %s.\n", FIRMWARE_VERSION);
    return;
  }

  Serial.printf("[OTA] %s → %s. Baixando...\n", FIRMWARE_VERSION, remoteVersion);

  HTTPClient otaHttp;
  if (!otaHttp.begin(secureClient, remoteUrl)) {
    Serial.println("[OTA] begin(bin) falhou.");
    return;
  }
  otaHttp.setTimeout(60000);
  int otaCode = otaHttp.GET();
  if (otaCode != 200) {
    Serial.printf("[OTA] firmware.bin ← %d\n", otaCode);
    otaHttp.end();
    return;
  }
  int size = otaHttp.getSize();
  if (size <= 0) {
    Serial.println("[OTA] Tamanho inválido.");
    otaHttp.end();
    return;
  }
  if (!Update.begin(size)) {
    Serial.printf("[OTA] Update.begin falhou (size=%d)\n", size);
    otaHttp.end();
    return;
  }
  size_t written = Update.writeStream(otaHttp.getStream());
  otaHttp.end();
  if (written != (size_t)size) {
    Serial.printf("[OTA] Escritos %u de %d bytes.\n", (unsigned)written, size);
    Update.abort();
    return;
  }
  if (!Update.end(true)) {
    Serial.printf("[OTA] Update.end falhou: %s\n", Update.errorString());
    return;
  }
  Serial.println("[OTA] Sucesso. Reiniciando...");
  delay(500);
  ESP.restart();
}
#endif

// ── Deep sleep ──
void dormirAgora() {
  Serial.println("[SLEEP] Dormindo 15 min... 💤");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
