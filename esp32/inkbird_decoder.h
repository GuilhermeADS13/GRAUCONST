#pragma once
#include <Arduino.h>

/**
 * Lógica de decodificação para o sensor Inkbird IBS-TH2 baseada no Theengs Decoder.
 * O sensor envia os dados no campo Manufacturer Data do anúncio BLE.
 * 
 * Estrutura do Manufacturer Data (Exemplo):
 * [0-1] ID da Empresa (0x48 0x43 para Inkbird/Engbird)
 * [2-3] Temperatura (Inteiro de 16 bits, Little Endian, dividido por 100)
 * [4-5] Umidade (Inteiro de 16 bits, Little Endian, dividido por 100)
 * [6] Bateria (%)
 */

struct InkbirdData {
    float temperature = NAN;
    float humidity = NAN;
    int battery = -1;
    bool success = false;
};

class InkbirdDecoder {
public:
    static InkbirdData decode(uint8_t* data, size_t length) {
        InkbirdData result;
        
        // Conforme Theengs Decoder para IBS-TH2 (IBS_THBP01B_json.h):
        // Temperatura: bytes 0 e 1 (Little Endian), dividido por 100
        // Umidade: bytes 2 e 3 (Little Endian), dividido por 100
        // Bateria: byte 7

        if (length >= 8) { // Mínimo de 8 bytes para ter temperatura, umidade e bateria
            int16_t tempRaw = (int16_t)(data[1] << 8 | data[0]); // Little Endian
            result.temperature = tempRaw / 100.0f;
            
            uint16_t humRaw = (uint16_t)(data[3] << 8 | data[2]); // Little Endian
            result.humidity = humRaw / 100.0f;
            
            result.battery = data[7];

            // Validação básica
            if (result.temperature > -40.0f && result.temperature < 100.0f &&
                result.humidity >= 0.0f && result.humidity <= 100.0f &&
                result.battery >= 0 && result.battery <= 100) {
                result.success = true;
            }
        }
        
        return result;
    }
};
