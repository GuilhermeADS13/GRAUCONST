// ============================================================
//  GRAUCONST — ESP32 + Inkbird IBS-TH2 (BLE) + Deep Sleep
//
//  Envia: temperatura, umidade, rssi, bateria_pct (0-100%)
//         exclusivamente do sensor Inkbird IBS-TH2 via BLE.
//  Intervalo: 15 minutos via Deep Sleep
// ============================================================

#include <WiFi.h>
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
#define FIRMWARE_VERSION  "1.1.0"

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

// ── Cliente HTTPS ────────────────────────────────────────────
WiFiClientSecure secureClient;
String sensorId;

// ── Protótipos ───────────────────────────────────────────────
String  gerarSensorId();
bool    conectarWiFi();
void    configurarTLS();
String  montarPayload(int rssi, InkbirdData ink);
bool    enviarLeitura(const String& payload);
void    dormirAgora();

// ── BLE Callback ─────────────────────────────────────────────
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        if (advertisedDevice.haveManufacturerData()) {
            String mData = String(advertisedDevice.getManufacturerData().c_str());
            uint8_t* data = (uint8_t*)mData.c_str();
            size_t len = mData.length();
            
            String name = String(advertisedDevice.getName().c_str());
            name.toLowerCase();
            
            if (name.indexOf("tps") != -1 || name.indexOf("sps") != -1 || (len >= 7 && data[0] == 0x48 && data[1] == 0x43)) {
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

void setup() {
  Serial.begin(115200);
  delay(500); 
  bootCount++;
  Serial.printf("\n[GRAUCONST] Boot #%d | FW %s\n", bootCount, FIRMWARE_VERSION);

  WiFi.mode(WIFI_STA);
  delay(100);
  sensorId = gerarSensorId();
  Serial.printf("[ID] %s\n", sensorId.c_str());

  Serial.printf("[BLE] Iniciando scan (%ds) para Inkbird...\n", BLE_SCAN_TIME);
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
    String payload = montarPayload(rssi, globalInkbird);
    if (!enviarLeitura(payload)) {
      Serial.println("[ERRO] Envio falhou.");
    }
  } else {
    Serial.println("[AVISO] Sem dados do Inkbird para enviar.");
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

void configurarTLS() {
#ifdef SKIP_TLS_VERIFY
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
    secureClient.setInsecure();
  } else {
    secureClient.setCACert(SUPABASE_ROOT_CA);
  }
#endif
}

String montarPayload(int rssi, InkbirdData ink) {
  JsonDocument doc;
  doc["sensor_id"]   = sensorId;
  doc["rssi"]        = rssi;
  doc["inkbird_temp"] = ink.temperature;
  doc["inkbird_hum"]  = ink.humidity;
  doc["inkbird_bat"]  = ink.battery;
  doc["temperatura"] = nullptr;
  doc["umidade"]     = nullptr;
  doc["bateria_pct"] = nullptr;

  String out;
  serializeJson(doc, out);
  return out;
}

bool enviarLeitura(const String& payload) {
  HTTPClient http;
  String url = String(SUPABASE_URL ) + "/functions/v1/sensor-ingest";
  if (!http.begin(secureClient, url )) return false;
  
  http.setTimeout(HTTP_TIMEOUT_MS );
  http.addHeader("Content-Type", "application/json" );
  http.addHeader("X-Device-Token", DEVICE_TOKEN );

  Serial.printf("[HTTP] → %s\n", payload.c_str());
  int code = http.POST(payload );
  Serial.printf("[HTTP] ← %d\n", code);
  http.end( );
  return (code == 201 || code == 200);
}

void dormirAgora() {
  Serial.println("[SLEEP] Dormindo 15 min... 💤");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
