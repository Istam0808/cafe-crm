import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@shared/auth';
import { TableGrid } from '@shared/components/TableGrid';
import { TopBar } from '@shared/components/TopBar';
import { useFloor } from '@shared/hooks';
import { CartScreen, CategoriesScreen, ProductsScreen } from './order';

export function WaiterApp() {
  return (
    <Routes>
      <Route index element={<Zones />} />
      <Route path="zone/:zoneId" element={<Tables />} />
      <Route path="table/:tableId" element={<CategoriesScreen />} />
      <Route path="table/:tableId/category/:categoryId" element={<ProductsScreen />} />
      <Route path="table/:tableId/cart" element={<CartScreen />} />
    </Routes>
  );
}

function Zones() {
  const { data } = useFloor();
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="Где сидят гости?" />
      <div className="zone-grid">
        {data?.zones.map((z) => {
          const tables = data.tables.filter((t) => t.zone_id === z.id);
          const busy = tables.filter((t) => t.order).length;
          return (
            <button key={z.id} className="zone-tile" onClick={() => navigate(`/zone/${z.id}`)}>
              <span className="zone-name">{z.name}</span>
              <span className="muted">занято {busy} из {tables.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tables() {
  const zoneId = Number(useParams().zoneId);
  const { data } = useFloor();
  const { user } = useAuth();
  const navigate = useNavigate();
  const zone = data?.zones.find((z) => z.id === zoneId);
  return (
    <div className="screen">
      <TopBar title={zone?.name ?? 'Столы'} back="/" />
      <div className="legend">
        <span className="dot dot-free" /> свободен <span className="dot dot-mine" /> мой <span className="dot dot-busy" /> другой официант
      </div>
      {data && (
        <TableGrid
          tables={data.tables.filter((t) => t.zone_id === zoneId)}
          myId={user?.id}
          onPick={(t) => navigate(`/table/${t.id}`)}
        />
      )}
    </div>
  );
}
