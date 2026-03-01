import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useConnectionStore } from '../../store/connectionStore';
import { CONNECTION_LABELS } from '../../lib/constants';
import type { ConnectionPhase } from '../../lib/types';

function getVariant(phase: ConnectionPhase) {
  if (phase === 'Connected') return 'success';
  if (phase === 'Disconnected') return 'muted';
  if (typeof phase === 'object' && 'Error' in phase) return 'danger';
  return 'info';
}

function getLabel(phase: ConnectionPhase) {
  if (typeof phase === 'object' && 'Error' in phase) return phase.Error;
  return CONNECTION_LABELS[phase] || phase;
}

export function ConnectionStatus() {
  const phase = useConnectionStore((s) => s.phase);
  const isConnecting =
    phase !== 'Disconnected' &&
    phase !== 'Connected' &&
    !(typeof phase === 'object' && 'Error' in phase);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isConnecting && <Spinner size={14} />}
      <Badge variant={getVariant(phase)} pulse={phase === 'Connected'}>
        {getLabel(phase)}
      </Badge>
    </div>
  );
}
