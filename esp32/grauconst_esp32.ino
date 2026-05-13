// ============================================================
//  GRAUCONST — ESP32 + DHT22 + Deep Sleep
//  Envia leitura para a Edge Function `sensor-ingest` do Supabase
//  a cada 15 minutos.
//
//  POR QUE PELA EDGE FUNCTION (e não REST direto):
//    A tabela `sensor_leituras` tem RLS endurecida — INSERT direto via
//    anon key NÃO é permitido. Apenas a Edge Function (com service_role)
//    consegue inserir. Isso impede que qualquer um com a chave pública
//    do projeto envie dados falsos.
//
//  Autenticação: header `X-Device-Token` validado pela Edge Function
//  contra o secret DEVICE_TOKEN configurado no Supabase.
//
//  Payload:
//    sensor_id     → ESP32-<MAC> ou override em secrets.h
//    temperatura   → °C (DHT22)
//    umidade       → % (DHT22)
//    rssi          → dBm (força do sinal WiFi)
//    bateria_v     → volts (opcional, se BATTERY_PIN definido)
//
//  Dependências Arduino IDE:
//    - DHT sensor library (Adafruit)
//    - ArduinoJson (v6 ou v7)
//
//  Antes de compilar: copie `secrets.h.example` para `secrets.h` e
//  preencha SSID, senha, SUPABASE_URL e DEVICE_TOKEN.
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

// ── ADC bateria ──────────────────────────────────────────────
#define ADC_RESOLUTION    4095.0f
#define ADC_VREF_VOLTS    3.3f

// Helpers
String gerarSensorId();
float lerBateriaVolts();
void dormirAgora();
bool conectarWiFi();
bool enviarParaSupabase(const String& sensorId, float temperatura, float umidade,
                        int rssi, float bateriaV);

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[GRAUCONST] Acordando...");

  dht.begin();
  delay(2000);  // DHT22 precisa de ~2s para estabilizar

  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[ERRO] Falha na leitura do DHT22. Dormindo...");
    dormirAgora();
    return;
  }

  Serial.printf("[SENSOR] Temp: %.1f°C | Umid: %.1f%%\n", temperatura, umidade);

  float bateria = lerBateriaVolts();
  if (!isnan(bateria)) {
    Serial.printf("[BAT] %.2f V\n", bateria);
  }

  if (!conectarWiFi()) {
    Serial.println("[ERRO] Sem WiFi. Dormindo...");
    dormirAgora();
    return;
  }

  int rssi = WiFi.RSSI();
  Serial.printf("[WiFi] RSSI: %d dBm\n", rssi);

  String sensorId = gerarSensorId();
  Serial.printf("[ID] sensor_id = %s\n", sensorId.c_str());

  bool ok = enviarParaSupabase(sensorId, temperatura, umidade, rssi, bateria);
  Serial.println(ok ? "[OK] Enviado com sucesso!" : "[ERRO] Falha no envio.");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  dormirAgora();
}

void loop() {}

// ── Gera sensor_id ───────────────────────────────────────────
String gerarSensorId() {
  String override_id = String(SENSOR_ID);
  if (override_id.length() > 0) return override_id;
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return "ESP32-" + mac;
}

// ── Leitura de bateria ───────────────────────────────────────
float lerBateriaVolts() {
#ifdef BATTERY_PIN
  int raw = analogRead(BATTERY_PIN);
  float v_adc = (raw / ADC_RESOLUTION) * ADC_VREF_VOLTS;
  return v_adc * BATTERY_DIVIDER;
#else
  return NAN;
#endif
}

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

// ── POST para Edge Function ──────────────────────────────────
// Envia para /functions/v1/sensor-ingest. Validado via X-Device-Token.
bool enviarParaSupabase(const String& sensorId, float temperatura, float umidade,
                        int rssi, float bateriaV) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";

  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type",    "application/json");
  http.addHeader("X-Device-Token",  DEVICE_TOKEN);

  StaticJsonDocument<192> doc;
  doc["sensor_id"]   = sensorId;
  doc["temperatura"] = temperatura;
  doc["umidade"]     = umidade;
  doc["rssi"]        = rssi;
  if (!isnan(bateriaV)) {
    doc["bateria_v"] = bateriaV;
  }

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
