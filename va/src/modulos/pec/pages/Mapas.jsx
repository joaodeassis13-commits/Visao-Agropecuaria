import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Map as IconeMapa } from 'lucide-react';
import { useApp } from '../../../core/context/AppContext';
import { useDadosPec } from '../hooks/useDadosPec';
import { MAPAS } from '../lib/constants';
import { fmtNum, hoje } from '../../../core/lib/util';
import { Cabecalho, Campo } from '../../../core/components/ui';

const menos7 = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toLocaleDateString('en-CA'); };

export default function Mapas() {
  const { fazendaId, setFazendaId, fazendasDisponiveis, toast } = useApp();
  const dados = useDadosPec();
  const [retiroId, setRetiroId] = useState('');
  const [de, setDe] = useState(menos7());
  const [ate, setAte] = useState(hoje());
  const [tipoMapa, setTipoMapa] = useState('massa');
  const [gps, setGps] = useState(false);

  const divRef = useRef(null);
  const mapaRef = useRef(null);
  const camadaRef = useRef(null);
  const gpsRef = useRef({ watch: null, ponto: null, raio: null, centralizou: false });

  const piquetes = useMemo(
    () => dados.piquetes.filter((p) => p.geometria && (!retiroId || p.retiro_id === retiroId)),
    [dados.piquetes, retiroId],
  );

  const chavePiquetes = piquetes.map((p) => `${p.id}:${p.updated_at}`).join('|') + dados.retiros.map((r) => r.nome).join('|');

  // cria o mapa
  useEffect(() => {
    const mapa = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView([-13.5, -52.3], 6);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagens © Esri',
    }).addTo(mapa);
    camadaRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    const r = () => mapa.invalidateSize();
    setTimeout(r, 100);
    window.addEventListener('resize', r);
    return () => {
      window.removeEventListener('resize', r);
      if (gpsRef.current.watch != null) navigator.geolocation.clearWatch(gpsRef.current.watch);
      mapa.remove();
    };
  }, []);

  // desenha os piquetes (por enquanto sem pintura temática — cada mapa será construído na sequência)
  useEffect(() => {
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!mapa || !camada) return;
    camada.clearLayers();
    if (!piquetes.length) return;
    const grupo = L.featureGroup();
    for (const p of piquetes) {
      const lyr = L.geoJSON(p.geometria, {
        style: { color: '#ffffff', weight: 2, fillColor: '#9aa59d', fillOpacity: 0.35 },
      });
      lyr.bindTooltip(p.nome, { permanent: true, direction: 'center', className: 'rotulo-piquete' });
      lyr.bindPopup(
        `<b>${p.nome}</b><br>Retiro: ${dados.nomeRetiro(p.retiro_id)}<br>` +
        `Espécie: ${p.especie_forrageira || '—'}<br>Área: ${fmtNum(p.area_ha, 2)} ha`,
      );
      lyr.addTo(grupo);
    }
    grupo.addTo(camada);
    mapa.fitBounds(grupo.getBounds(), { padding: [24, 24] });
  }, [chavePiquetes]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarGps() {
    const g = gpsRef.current;
    const mapa = mapaRef.current;
    if (gps) {
      if (g.watch != null) navigator.geolocation.clearWatch(g.watch);
      g.ponto?.remove(); g.raio?.remove();
      Object.assign(g, { watch: null, ponto: null, raio: null, centralizou: false });
      setGps(false);
      return;
    }
    if (!navigator.geolocation) { toast('Este aparelho não fornece localização.', 'erro'); return; }
    setGps(true);
    g.watch = navigator.geolocation.watchPosition(
      (pos) => {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        if (!g.ponto) {
          g.raio = L.circle(ll, { radius: pos.coords.accuracy, color: '#1e6fd9', weight: 1, fillOpacity: 0.12 }).addTo(mapa);
          g.ponto = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="ponto-gps"></div>', iconSize: [18, 18] }), zIndexOffset: 1000 }).addTo(mapa);
        } else {
          g.ponto.setLatLng(ll);
          g.raio.setLatLng(ll).setRadius(pos.coords.accuracy);
        }
        if (!g.centralizou) { mapa.setView(ll, Math.max(mapa.getZoom(), 15)); g.centralizou = true; }
      },
      (err) => {
        toast(err.code === 1 ? 'Permissão de localização negada.' : 'Não foi possível obter a localização.', 'erro');
        setGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  const mapa = MAPAS.find((m) => m.id === tipoMapa);

  return (
    <div className="pagina">
      <Cabecalho icone={IconeMapa} titulo="Mapas" desc="Piquetes da fazenda sobre imagem de satélite, pintados conforme o mapa selecionado." />

      <div className="painel">
        <div className="filtros-mapa">
          <Campo label="Fazenda">
            <select value={fazendaId || ''} onChange={(e) => { setFazendaId(e.target.value); setRetiroId(''); }}>
              {fazendasDisponiveis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Retiro">
            <select value={retiroId} onChange={(e) => setRetiroId(e.target.value)}>
              <option value="">Todos</option>
              {dados.retirosPermitidos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Período — de">
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo label="Até">
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>

        <div className="botoes-mapa">
          {MAPAS.map((m) => (
            <button key={m.id} className={`mapa-btn ${tipoMapa === m.id ? 'ativo' : ''}`} onClick={() => setTipoMapa(m.id)}>{m.label}</button>
          ))}
          <button className={`btn sec peq btn-gps ${gps ? 'ativo' : ''}`} onClick={alternarGps}>
            <Crosshair size={16} /> {gps ? 'Ocultar minha localização' : 'Minha localização'}
          </button>
        </div>
      </div>

      <div className="mapa-area">
        <div ref={divRef} style={{ width: '100%', height: '100%' }} />
        {!piquetes.length && (
          <div className="mapa-vazio"><div>Nenhum piquete com geometria para exibir.</div></div>
        )}
        <div className="legenda">
          <b>{mapa.label}{mapa.unidade ? ` (${mapa.unidade})` : ''}</b>
          <p>{mapa.desc}</p>
          <p style={{ marginTop: 6 }}><span className="pill amarelo">Legenda em construção</span></p>
        </div>
      </div>
    </div>
  );
}
