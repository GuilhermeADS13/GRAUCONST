// ============================================================
//  GRAUCONST — ESP32 + DHT22 (temperatura) + Deep Sleep
//  Envia leitura para Supabase a cada 15 minutos
//  Dependências Arduino IDE:
//    - DHT sensor library (Adafruit)
//    - ArduinoJson (v6)
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ── WiFi ─────────────────────────────────────────────────────
const char* WIFI_SSID     = "SEU_SSID_AQUI";
const char* WIFI_PASSWORD = "SUA_SENHA_AQUI";

// ── Supabase ─────────────────────────────────────────────────
const char* SUPABASE_URL  = "https://XXXXXXXXXXXX.supabase.co";
const char* SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // anon key
const char* SENSOR_ID     = "DHT22-01";

// ── Sensor ───────────────────────────────────────────────────
#define DHT_PIN    4
#define DHT_TYPE   DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ── Deep Sleep: 15 minutos ───────────────────────────────────
#define SLEEP_US  (15ULL * 60ULL * 1000000ULL)

// ── WiFi timeout ─────────────────────────────────────────────
#define WIFI_TIMEOUT_MS  15000

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[GRAUCONST] Acordando...");

  dht.begin();
  delay(2000); // DHT22 precisa de 2s para estabilizar

  float temperatura = dht.readTemperature();

  if (isnan(temperatura)) {
    Serial.println("[ERRO] Falha na leitura do DHT22. Dormindo...");
    dormirAgora();
    return;
  }

  Serial.printf("[SENSOR] Temperatura: %.1f°C\n", temperatura);

  if (!conectarWiFi()) {
    Serial.println("[ERRO] Sem WiFi. Dormindo...");
    dormirAgora();
    return;
  }

  bool ok = enviarParaSupabase(temperatura);
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
bool enviarParaSupabase(float temperatura) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_leituras";

  http.begin(url);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer",        "return=minimal");

  StaticJsonDocument<96> doc;
  doc["sensor_id"]   = SENSOR_ID;
  doc["temperatura"] = round(temperatura * 10.0) / 10.0;

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
