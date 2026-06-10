#pragma once
#include <Arduino.h>

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
        
        // Se os dados incluírem o ID do fabricante (0x48 0x43), pulamos os 2 primeiros bytes
        uint8_t* p = data;
        if (length >= 2 && data[0] == 0x48 && data[1] == 0x43) {
            p = &data[2];
            length -= 2;
        }

        if (length >= 7) { 
            // Temperatura e Umidade em Little Endian (dividido por 100)
            int16_t tempRaw = (int16_t)(p[1] << 8 | p[0]); 
            result.temperature = tempRaw / 100.0f;
            
            uint16_t humRaw = (uint16_t)(p[3] << 8 | p[2]); 
            result.humidity = humRaw / 100.0f;
            
            // Bateria no byte 7 (ou 5 após remover ID)
            result.battery = p[5];

            if (result.temperature > -40.0f && result.temperature < 100.0f &&
                result.humidity >= 0.0f && result.humidity <= 100.0f) {
                result.success = true;
            }
        }
        return result;
    }
};
