import * as Location from 'expo-location';

// Pede permissão de localização (se ainda não tiver) e devolve a posição
// atual do usuário. Devolve null se a pessoa negar a permissão.
export async function buscarLocalizacaoAtual() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.log('[localizacao] permissão negada');
    return null;
  }

  const posicao = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    lat: posicao.coords.latitude,
    lng: posicao.coords.longitude,
  };
}

// Descobre o nome da cidade a partir de coordenadas (lat/lng), usando o
// próprio expo-location — não precisa de nenhuma biblioteca nova nem
// chave de API extra.
export async function buscarCidadePorCoordenadas(lat, lng) {
  try {
    const resultado = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const local = resultado?.[0];
    return local?.city || local?.subregion || local?.region || null;
  } catch (e) {
    console.log('[localizacao] erro ao descobrir cidade:', e?.message || e);
    return null;
  }
}
