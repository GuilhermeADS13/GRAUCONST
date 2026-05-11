// ============================================================
//  GRAUCONST — ESP32 + DHT22 (temperatura + umidade) + Deep Sleep
//  Envia leitura para Supabase a cada 15 minutos
//  Dependências Arduino IDE:
//    - DHT sensor library (Adafruit)
//    - ArduinoJson (v6 ou v7)
//
//  Antes de compilar: copie `secrets.h.example` para `secrets.h`
//  e preencha SSID, senha, URL e chave do Supabase.
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ── Sensor ───────────────────────────────────────────────────
#define DHT_PIN    4
#define DHT_TYPE   DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ── Deep Sleep: 15 minutos ───────────────────────────────────
#define SLEEP_US  (15ULL * 60ULL * 1000000ULL)

// ── Timeouts ─────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS  15000
#define HTTP_TIMEOUT_MS  10000

void dormirAgora();
bool conectarWiFi();
bool enviarParaSupabase(float temperatura, float umidade);

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[GRAUCONST] Acordando...");

  dht.begin();
  // DHT22 precisa de ~2s após power-up para estabilizar a primeira leitura
  delay(2000);

  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[ERRO] Falha na leitura do DHT22. Dormindo...");
    dormirAgora();
    return;
  }

  Serial.printf("[SENSOR] Temp: %.1f°C | Umid: %.1f%%\n", temperatura, umidade);

  if (!conectarWiFi()) {
    Serial.println("[ERRO] Sem WiFi. Dormindo...");
    dormirAgora();
    return;
  }

  bool ok = enviarParaSupabase(temperatura, umidade);
  Serial.println(ok ? "[OK] Enviado com sucesso!" : "[ERRO] Falha no envio.");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  dormirAgora();
}

void loop() {}

// ── Conecta WiFi com timeout ─────────────────────────────────
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

// ── HTTP POST para Supabase ──────────────────────────────────
bool enviarParaSupabase(float temperatura, float umidade) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_leituras";

  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer",        "return=minimal");

  StaticJsonDocument<128> doc;
  doc["sensor_id"]   = SENSOR_ID;
  doc["temperatura"] = temperatura;
  doc["umidade"]     = umidade;

  String payload;
  serializeJson(doc, payload);
  Serial.printf("[HTTP] POST %s | %s\n", url.c_str(), payload.c_str());

  int code = http.POST(payload);
  Serial.printf("[HTTP] Status: %d\n", code);
  http.end();
  return (code == 201);
}

// ── Deep sleep ───────────────────────────────────────────────
void dormirAgora() {
  Serial.printf("[SLEEP] Dormindo por 15 minutos... 💤\n");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_US);
  esp_deep_sleep_start();
}
