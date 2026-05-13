// ============================================================
//  GRAUCONST — ESP32 + DHT22 + Deep Sleep
//  Envia: temperatura, umidade, rssi, bateria_pct (0-100%)
//  Intervalo: 15 minutos via Deep Sleep
//
//  Bateria:
//    O ESP32 lê a tensão da bateria LiPo (3.0V–4.2V) via ADC
//    com divisor resistivo (100kΩ + 100kΩ) no pino BATTERY_PIN.
//    A tensão lida é convertida para porcentagem (0–100%).
//    Curva: 4.2V = 100% | 3.7V = 50% | 3.0V = 0%
//
//    Se não quiser bateria, deixe BATTERY_PIN indefinido em secrets.h.
//
//  Dependências Arduino IDE:
//    - DHT sensor library (Adafruit)
//    - ArduinoJson (v6 ou v7)
//
//  Antes de compilar: copie secrets.h.example → secrets.h e preencha.
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ── Sensor ───────────────────────────────────────────────────
#define DHT_PIN   4
#define DHT_TYPE  DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ── Deep Sleep: 15 minutos ───────────────────────────────────
#define SLEEP_US  (15ULL * 60ULL * 1000000ULL)

// ── Timeouts ─────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS  15000
#define HTTP_TIMEOUT_MS  10000

// ── ADC bateria ──────────────────────────────────────────────
// Divisor resistivo 1:2 → tensão real = leitura ADC × 2
// LiPo: 4.2V (100%) → 3.0V (0%)
#define BAT_MAX_V   4.2f
#define BAT_MIN_V   3.0f
#define ADC_VREF    3.3f
#define ADC_MAX     4095.0f
#define ADC_DIVIDER 2.0f   // fator do divisor resistivo (R1=R2=100kΩ)

// ── Protótipos ───────────────────────────────────────────────
bool    conectarWiFi();
float   lerBateria_pct();
bool    enviarParaSupabase(float temperatura, float umidade, int rssi, float bat_pct);
void    dormirAgora();

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[GRAUCONST] Acordando...");

  dht.begin();
  delay(2000);  // DHT22 precisa ~2s para estabilizar

  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[ERRO] Falha na leitura do DHT22. Dormindo...");
    dormirAgora();
    return;
  }

  Serial.printf("[SENSOR] Temp: %.1f°C | Umid: %.1f%%\n", temperatura, umidade);

  float bat_pct = lerBateria_pct();
  if (!isnan(bat_pct)) {
    Serial.printf("[BAT] %.0f%%\n", bat_pct);
  }

  if (!conectarWiFi()) {
    dormirAgora();
    return;
  }

  int rssi = WiFi.RSSI();
  Serial.printf("[WiFi] RSSI: %d dBm\n", rssi);

  bool ok = enviarParaSupabase(temperatura, umidade, rssi, bat_pct);
  Serial.println(ok ? "[OK] Enviado!" : "[ERRO] Falha no envio.");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  dormirAgora();
}

void loop() {}

// ── Bateria: retorna porcentagem 0–100% ──────────────────────
// Fórmula linear: 4.2V = 100%, 3.0V = 0%
// Se BATTERY_PIN não definido em secrets.h → retorna NAN (sem envio)
float lerBateria_pct() {
#ifdef BATTERY_PIN
  // Média de 10 leituras para reduzir ruído do ADC
  int soma = 0;
  for (int i = 0; i < 10; i++) { soma += analogRead(BATTERY_PIN); delay(5); }
  float raw = soma / 10.0f;

  float v_adc  = (raw / ADC_MAX) * ADC_VREF;   // tensão no pino ADC
  float v_real = v_adc * ADC_DIVIDER;           // tensão real da bateria

  // Clamp e mapeamento linear para porcentagem
  float pct = ((v_real - BAT_MIN_V) / (BAT_MAX_V - BAT_MIN_V)) * 100.0f;
  if (pct > 100.0f) pct = 100.0f;
  if (pct < 0.0f)   pct = 0.0f;

  return pct;
#else
  return NAN;
#endif
}

// ── WiFi ─────────────────────────────────────────────────────
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

// ── POST para Edge Function ──────────────────────────────────
bool enviarParaSupabase(float temperatura, float umidade, int rssi, float bat_pct) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";

  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type",   "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  StaticJsonDocument<256> doc;
  doc["sensor_id"]   = SENSOR_ID;
  doc["temperatura"] = temperatura;
  doc["umidade"]     = umidade;
  doc["rssi"]        = rssi;
  if (!isnan(bat_pct)) doc["bateria_pct"] = (int)bat_pct;  // 0–100 inteiro

  String payload;
  serializeJson(doc, payload);
  Serial.printf("[HTTP] %s\n", payload.c_str());

  int code = http.POST(payload);
  Serial.printf("[HTTP] Status: %d\n", code);
  http.end();
  return (code == 201);
}

// ── Deep sleep ───────────────────────────────────────────────
void dormirAgora() {
  Serial.println("[SLEEP] Dormindo 15 min... 💤");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
