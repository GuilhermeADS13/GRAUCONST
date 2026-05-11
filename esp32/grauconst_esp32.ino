// ============================================================
//  GRAUCONST — ESP32 com DHT22 + Deep Sleep
//  Envia leitura para Supabase a cada 15 minutos
//  IDE Arduino — dependências: DHT sensor library, WiFi, HTTPClient
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>    // versão 6.x

// ── Configurações WiFi ───────────────────────────────────────
const char* WIFI_SSID     = "SEU_SSID_AQUI";
const char* WIFI_PASSWORD = "SUA_SENHA_AQUI";

// ── Configurações Supabase ───────────────────────────────────
const char* SUPABASE_URL  = "https://XXXXXXXXXXXX.supabase.co";
const char* SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // anon key
const char* SENSOR_ID     = "DHT22-01";

// ── Configurações do sensor ──────────────────────────────────
#define DHT_PIN    4        // GPIO conectado ao DATA do DHT22
#define DHT_TYPE   DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// ── Intervalo de sleep ───────────────────────────────────────
// 15 minutos = 15 * 60 * 1.000.000 microsegundos
#define SLEEP_INTERVAL_US  (15ULL * 60ULL * 1000000ULL)

// ── Timeout WiFi ─────────────────────────────────────────────
#define WIFI_TIMEOUT_MS    15000

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n\n[GRAUCONST] Acordando do deep sleep...");

  // Inicializa sensor
  dht.begin();
  delay(2000); // DHT22 precisa de 2s para estabilizar

  // Lê temperatura e umidade
  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  // Valida leitura
  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("[ERRO] Falha na leitura do DHT22. Dormindo para tentar novamente...");
    dormirAgora();
    return;
  }

  Serial.printf("[SENSOR] Temperatura: %.1f°C | Umidade: %.1f%%\n", temperatura, umidade);

  // Conecta ao WiFi
  if (!conectarWiFi()) {
    Serial.println("[ERRO] Falha no WiFi. Dormindo...");
    dormirAgora();
    return;
  }

  // Envia para Supabase
  bool sucesso = enviarParaSupabase(temperatura, umidade);

  if (sucesso) {
    Serial.println("[OK] Dados enviados com sucesso!");
  } else {
    Serial.println("[ERRO] Falha ao enviar dados.");
  }

  // Desconecta WiFi para economizar energia
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  dormirAgora();
}

void loop() {
  // Nunca executa — o ESP32 reinicia via deep sleep
}

// ============================================================
//  Conecta ao WiFi com timeout
// ============================================================
bool conectarWiFi() {
  Serial.printf("[WiFi] Conectando a %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - inicio > WIFI_TIMEOUT_MS) {
      Serial.println("\n[WiFi] Timeout!");
      return false;
    }
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\n[WiFi] Conectado! IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// ============================================================
//  Envia JSON para a API REST do Supabase (HTTP POST)
// ============================================================
bool enviarParaSupabase(float temperatura, float umidade) {
  HTTPClient http;

  // Endpoint da tabela sensor_leituras
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_leituras";

  http.begin(url);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer",        "return=minimal"); // não retorna o registro criado

  // Monta JSON
  StaticJsonDocument<128> doc;
  doc["sensor_id"]   = SENSOR_ID;
  doc["temperatura"] = round(temperatura * 10.0) / 10.0;
  doc["umidade"]     = round(umidade     * 10.0) / 10.0;

  String payload;
  serializeJson(doc, payload);

  Serial.printf("[HTTP] POST %s\n", url.c_str());
  Serial.printf("[HTTP] Payload: %s\n", payload.c_str());

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("[HTTP] Resposta: %d\n", httpCode);
    // 201 = Created (sucesso)
    http.end();
    return (httpCode == 201);
  } else {
    Serial.printf("[HTTP] Erro: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    return false;
  }
}

// ============================================================
//  Entra em deep sleep pelo intervalo definido
// ============================================================
void dormirAgora() {
  Serial.printf("[SLEEP] Dormindo por %llu minutos...\n", SLEEP_INTERVAL_US / 60000000ULL);
  Serial.println("[SLEEP] Até a próxima leitura. Boa noite! 💤");
  Serial.flush();

  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_US);
  esp_deep_sleep_start();
}
