import { useState, useEffect } from 'react';
import { checkForUpdates, type UpdateInfo } from '../lib/tauri';
import { useSettingsStore } from '../store/settingsStore';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useUpdateCheck(): UpdateInfo | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const enabled = useSettingsStore((s) => s.checkForUpdates);
  const lastCheck = useSettingsStore((s) => s.lastUpdateCheck);
  const dismissedVersion = useSettingsStore((s) => s.dismissedVersion);
  const setUpdateCheck = useSettingsStore((s) => s.setUpdateCheck);

  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;

    let cancelled = false;
    checkForUpdates()
      .then((info) => {
        if (cancelled) return;
        setUpdateCheck(Date.now());
        if (info.update_available) setUpdate(info);
      })
      .catch((err) => {
        console.warn('[deskclaw] update check failed:', err);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (update && dismissedVersion === update.latest_version) return null;
  return update;
}
