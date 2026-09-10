// Open-Meteo é gratuita de verdade — sem chave, sem cadastro, sem limite
// baixo de uso. Perfeita pra um app pessoal como esse.
export async function buscarClima(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Falha ao buscar o clima');
  }
  const data = await response.json();

  const tempAtual = Math.round(data?.current?.temperature_2m);
  const tempMax = Math.round(data?.daily?.temperature_2m_max?.[0]);
  const chanceChuva = data?.daily?.precipitation_probability_max?.[0];
  const codigoClima = data?.current?.weather_code;

  return { tempAtual, tempMax, chanceChuva, codigoClima };
}

// Monta o texto, o ícone (nome do MaterialCommunityIcons) e a cor certa
// pra situação — só avisa algo quando vale a pena (chuva/tempestade/calor
// forte/neve); senão, só mostra a temperatura atual, sem alarde.
export function resumoClima({ tempAtual, tempMax, chanceChuva, codigoClima }) {
  // Códigos do padrão WMO usados pela Open-Meteo: 95-99 = tempestade,
  // 71-77 = neve, 45-48 = neblina.
  const ehTempestade = codigoClima >= 95;
  const ehNeve = codigoClima >= 71 && codigoClima <= 77;

  if (ehTempestade) {
    return { texto: `Tempestade prevista · ${tempAtual}°C`, icone: 'weather-lightning', cor: '#7B4FA6' };
  }
  if (ehNeve) {
    return { texto: `Neve prevista · ${tempAtual}°C`, icone: 'weather-snowy', cor: '#5BA3C7' };
  }
  if (chanceChuva != null && chanceChuva >= 50) {
    return { texto: `${chanceChuva}% de chance de chuva · ${tempAtual}°C`, icone: 'weather-pouring', cor: '#4A90D9' };
  }
  if (tempMax != null && tempMax >= 32) {
    return { texto: `Dia quente, máxima de ${tempMax}°C`, icone: 'weather-sunny-alert', cor: '#D9622B' };
  }
  if (tempAtual != null) {
    return { texto: `${tempAtual}°C agora`, icone: 'weather-sunny', cor: '#8A9BA3' };
  }
  return null;
}
