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
        
        // O IBS-TH2 geralmente envia 7 a 9 bytes no manufacturer data
        // Algumas versões usam 9 bytes: [ID_L] [ID_H] [T_L] [T_H] [H_L] [H_H] [BAT] [??] [??]
        if (length >= 7) {
            // Decodifica temperatura (Little Endian)
            int16_t tempRaw = (int16_t)(data[3] << 8 | data[2]);
            result.temperature = tempRaw / 100.0f;
            
            // Decodifica umidade (Little Endian)
            uint16_t humRaw = (uint16_t)(data[5] << 8 | data[4]);
            result.humidity = humRaw / 100.0f;
            
            // Bateria
            result.battery = data[6];
            
            // Validação básica
            if (result.temperature > -40.0f && result.temperature < 100.0f &&
                result.humidity >= 0.0f && result.humidity <= 100.0f) {
                result.success = true;
            }
        }
        
        return result;
    }
};
