// Nomes amigáveis por sensor_id — exibidos no lugar do ID técnico.
// Mantenha em sincronia com SENSOR_NOMES na função telegram-alert.
const SENSOR_NOMES = {
  'ESP32-1CC3ABC28A30': 'Arosa-Loja',
}

export function nomeSensor(sensorId) {
  if (!sensorId) return '—'
  return SENSOR_NOMES[sensorId] ?? sensorId
}

export function formatDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function classificarTemp(t) {
  if (t === null || t === undefined) return { labelKey: 'status.unknown', cor: 'blue' }
  if (t < 18) return { labelKey: 'status.cold', cor: 'blue' }
  if (t < 25) return { labelKey: 'status.comfortable', cor: 'teal' }
  if (t < 30) return { labelKey: 'status.warm', cor: 'amber' }
  return { labelKey: 'status.hot', cor: 'red' }
}

export function classificarUmidade(u) {
  if (u === null || u === undefined) return { labelKey: 'status.unknown', cor: 'blue' }
  if (u < 30) return { labelKey: 'status.dry', cor: 'amber' }
  if (u < 60) return { labelKey: 'status.comfortable', cor: 'teal' }
  return { labelKey: 'status.humid', cor: 'blue' }
}

export function classificarBateria(pct) {
  if (pct === null || pct === undefined) return { labelKey: 'status.unknown', cor: 'blue' }
  if (pct >= 60) return { labelKey: 'status.batteryFull', cor: 'teal' }
  if (pct >= 30) return { labelKey: 'status.batteryMedium', cor: 'amber' }
  return { labelKey: 'status.batteryLow', cor: 'red' }
}

export function classificarWifi(rssi) {
  if (rssi === null || rssi === undefined) return { labelKey: 'status.unknown', cor: 'blue' }
  if (rssi >= -50) return { labelKey: 'status.wifiExcellent', cor: 'teal' }
  if (rssi >= -65) return { labelKey: 'status.wifiGood', cor: 'teal' }
  if (rssi >= -75) return { labelKey: 'status.wifiFair', cor: 'amber' }
  if (rssi >= -85) return { labelKey: 'status.wifiWeak', cor: 'amber' }
  return { labelKey: 'status.wifiVeryWeak', cor: 'red' }
}
