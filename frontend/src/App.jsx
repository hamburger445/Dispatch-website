import { useState, useCallback, useEffect } from 'react';
import { useCAD } from './hooks/useCAD';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CallsPanel from './components/CallsPanel';
import CallEditor from './components/CallEditor';
import UnitsPanel from './components/UnitsPanel';
import RightSidebar from './components/RightSidebar';
import TrafficStopsPanel from './components/TrafficStopsPanel';
import UnitModal from './components/UnitModal';
import NewCallModal from './components/NewCallModal';
import TrafficStopModal from './components/TrafficStopModal';
import TrafficStopDetailModal from './components/TrafficStopDetailModal';
import SearchModal from './components/SearchModal';
import ReportsPanel from './components/ReportsPanel';
import Notifications from './components/Notifications';
import ActivityPanel from './components/ActivityPanel';
import Portal from './components/Portal';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import { useAuth } from './auth';
import { api } from './constants';

export default function App() {
  const { user, loading, logout } = useAuth();
  const { state, connected, notifications, setTheme, notify, officerNotes, dismissNote } = useCAD();

  const theme = state?.settings?.theme || 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.colorScheme = theme;
  }, [theme]);

  if (loading) {
    return <div className="cad-app loading"><div className="spinner" /><p>Loading…</p></div>;
  }
  if (!user) {
    return <Login />;
  }
  if (user.role === 'personnel') {
    if (!state) return <div className="cad-app loading"><div className="spinner" /><p>Loading Greenville CAD...</p></div>;
    return (
      <>
        <Portal state={state} connected={connected} notify={notify} officerNotes={officerNotes} onDismissNote={dismissNote} />
        <Notifications items={notifications} />
      </>
    );
  }

  if (!state) {
    return <div className="cad-app loading"><div className="spinner" /><p>Loading Greenville CAD...</p></div>;
  }

  return <DispatcherConsole
    state={state} connected={connected} notifications={notifications} setTheme={setTheme}
    notify={notify} user={user} logout={logout}
  />;
}

function DispatcherConsole({ state, connected, notifications, setTheme, notify, user, logout }) {
  const [view, setView] = useState('dispatch');
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [unitModal, setUnitModal] = useState(null);
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [trafficModal, setTrafficModal] = useState(null);
  const [trafficStopDetail, setTrafficStopDetail] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const theme = state?.settings?.theme || 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.colorScheme = theme;
  }, [theme]);

  useKeyboardShortcuts({
    'ctrl+n': () => setNewCallOpen(true),
    'ctrl+u': () => setUnitModal({ create: true }),
    'ctrl+f': () => setSearchOpen(true),
    escape: () => { setSearchOpen(false); setUnitModal(null); setNewCallOpen(false); setTrafficModal(null); setTrafficStopDetail(null); },
  });

  const selectedCall = state?.calls.find(c => c.id === selectedCallId) || null;

  const saveCall = useCallback(async (data) => {
    await api('PUT', `/calls/${data.id}`, data);
  }, []);

  const handleNewCall = async (data) => {
    try {
      const res = await api('POST', '/calls', data);
      const created = res.calls.find(c =>
        c.assigned_units?.length && data.unit_ids?.includes(c.assigned_units[0]?.id)
      ) || res.calls.find(c => !['Closed', 'Cancelled'].includes(c.status));
      if (created) setSelectedCallId(created.id);
      setNewCallOpen(false);
      notify({ type: 'info', message: `Call created — ${created?.incident_number || 'incident'}` });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Failed to create call' });
    }
  };

  return (
    <div className="cad-app">
      <Header connected={connected} theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onSearch={() => setSearchOpen(true)} user={user} onLogout={logout} onAdmin={user.role === 'admin' ? () => setAdminOpen(true) : undefined} />

      <div className="cad-body">
        <Sidebar view={view} setView={setView} stats={state.stats} onReports={() => setReportsOpen(true)} />

        <main className="cad-main">
          <div className="quick-bar">
            <button className="btn primary" onClick={() => setNewCallOpen(true)}>+ New Call</button>
            <button className="btn secondary" onClick={() => setUnitModal({ create: true })}>+ Add Unit</button>
            <button className="btn secondary" onClick={() => setView('traffic')}>+ Traffic Stop</button>
          </div>

          {view === 'dispatch' && (
            <div className="dispatch-grid">
              <CallsPanel
                calls={state.calls}
                selectedId={selectedCallId}
                onSelect={(c) => setSelectedCallId(c.id)}
                filter="active"
              />
              <CallEditor
                key={selectedCall?.id || 'none'}
                call={selectedCall}
                units={state.units}
                fleet={state.fleet || []}
                callTypes={state.callTypes || []}
                onSave={saveCall}
                onDelete={async (id) => { await api('DELETE', `/calls/${id}`); setSelectedCallId(null); }}
                onClose={async (id) => { await api('PUT', `/calls/${id}`, { status: 'Closed' }); }}
                onCancel={async (id) => { await api('PUT', `/calls/${id}`, { status: 'Cancelled' }); }}
                onAssign={(callId, unitId) => api('POST', `/calls/${callId}/assign`, { unit_id: unitId })}
                onUnassign={(callId, unitId) => api('POST', `/calls/${callId}/unassign`, { unit_id: unitId })}
                onAssignFleet={(callId, fleetId) => api('POST', `/calls/${callId}/assign-fleet`, { fleet_id: fleetId })}
                onUnassignFleet={(callId, fleetId) => api('POST', `/calls/${callId}/unassign-fleet`, { fleet_id: fleetId })}
              />
            </div>
          )}

          {view === 'calls' && (
            <div className="dispatch-grid">
              <CallsPanel calls={state.calls} selectedId={selectedCallId} onSelect={(c) => setSelectedCallId(c.id)} filter="all" />
              <CallEditor
                key={selectedCall?.id || 'none'}
                call={selectedCall}
                units={state.units}
                fleet={state.fleet || []}
                callTypes={state.callTypes || []}
                onSave={saveCall}
                onDelete={async (id) => { await api('DELETE', `/calls/${id}`); setSelectedCallId(null); }}
                onClose={async (id) => { await api('PUT', `/calls/${id}`, { status: 'Closed' }); }}
                onCancel={async (id) => { await api('PUT', `/calls/${id}`, { status: 'Cancelled' }); }}
                onAssign={(callId, unitId) => api('POST', `/calls/${callId}/assign`, { unit_id: unitId })}
                onUnassign={(callId, unitId) => api('POST', `/calls/${callId}/unassign`, { unit_id: unitId })}
                onAssignFleet={(callId, fleetId) => api('POST', `/calls/${callId}/assign-fleet`, { fleet_id: fleetId })}
                onUnassignFleet={(callId, fleetId) => api('POST', `/calls/${callId}/unassign-fleet`, { fleet_id: fleetId })}
              />
            </div>
          )}

          {view === 'units' && (
            <UnitsPanel
              units={state.units}
              onEdit={(u) => setUnitModal({ unit: u })}
              onStatusChange={(id, status) => api('PATCH', `/units/${id}/status`, { status })}
              onTrafficStop={(u) => setTrafficModal(u)}
            />
          )}

          {view === 'traffic' && (
            <TrafficStopsPanel
              stops={state.trafficStops || []}
              units={state.units}
              onStart={(u) => setTrafficModal(u)}
              onSelectStop={(s) => setTrafficStopDetail(s)}
              onClear={async (id) => {
                try {
                  await api('POST', `/traffic-stops/${id}/clear`, { status: '10-8' });
                  if (trafficStopDetail?.id === id) setTrafficStopDetail(null);
                  notify({ type: 'info', message: 'Traffic stop cleared' });
                } catch (e) {
                  notify({ type: 'error', message: e.message || 'Failed to clear traffic stop' });
                }
              }}
            />
          )}

          {view === 'activity' && <ActivityPanel entries={state.activity} full />}
        </main>

        <aside className="cad-right">
          <RightSidebar
            view={view}
            state={state}
            onEditUnit={(u) => setUnitModal({ unit: u })}
            onStatusChange={(id, status) => api('PATCH', `/units/${id}/status`, { status })}
            onTrafficStop={(u) => setTrafficModal(u)}
            onSelectCall={(id) => { setSelectedCallId(id); setView('dispatch'); }}
            onSelectStop={(s) => { setTrafficStopDetail(s); setView('traffic'); }}
          />
        </aside>
      </div>

      <Notifications items={notifications} />

      {unitModal && (
        <UnitModal
          unit={unitModal.unit}
          onClose={() => setUnitModal(null)}
          onSave={async (data) => {
            if (unitModal.unit) await api('PUT', `/units/${unitModal.unit.id}`, data);
            else await api('POST', '/units', data);
            setUnitModal(null);
          }}
          onDelete={unitModal.unit ? async () => { await api('DELETE', `/units/${unitModal.unit.id}`); setUnitModal(null); } : null}
        />
      )}

      {newCallOpen && (
        <NewCallModal
          units={state.units}
          fleet={state.fleet || []}
          callTypes={state.callTypes || []}
          onClose={() => setNewCallOpen(false)}
          onSave={handleNewCall}
        />
      )}

      {trafficStopDetail && (
        <TrafficStopDetailModal
          stop={state.trafficStops?.find(s => s.id === trafficStopDetail.id) || trafficStopDetail}
          units={state.units}
          onClose={() => setTrafficStopDetail(null)}
          onAddUnit={async (stopId, unitId) => {
            await api('POST', `/traffic-stops/${stopId}/add-unit`, { unit_id: unitId });
            notify({ type: 'info', message: 'Unit added to traffic stop' });
          }}
        />
      )}

      {trafficModal && (
        <TrafficStopModal
          unit={trafficModal}
          onClose={() => setTrafficModal(null)}
          onSave={async (data) => {
            await api('POST', '/traffic-stops', data);
            setTrafficModal(null);
            setView('traffic');
            notify({ type: 'info', message: `Traffic stop started — ${trafficModal.callsign}` });
          }}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelectUnit={(u) => { setUnitModal({ unit: u }); setView('units'); }}
          onSelectCall={(c) => { setSelectedCallId(c.id); setView('dispatch'); }}
        />
      )}

      {reportsOpen && <ReportsPanel onClose={() => setReportsOpen(false)} />}

      {adminOpen && <AdminPanel state={state} onClose={() => setAdminOpen(false)} notify={notify} />}
    </div>
  );
}
