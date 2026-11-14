import { useCallback, useEffect, useState } from 'react';
import type { Company, Site, SiteFilter } from '../../shared/types';
import { api } from './api';
import { useApp } from './context';

/** Firma ve şantiye listesini yükler. */
export function useSites() {
  const { showError } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const reload = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.companiesList(), api.sitesList()]);
      setCompanies(c);
      setSites(s);
    } catch (e) {
      showError(e);
    }
  }, [showError]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { companies, sites, reload };
}

/** Filtre seçimini metne çevirir: '' (tümü), 'c:3' (firma), 's:7' (şantiye) */
export function scopeToFilter(scope: string): SiteFilter {
  if (scope.startsWith('s:')) return { siteId: Number(scope.slice(2)) };
  if (scope.startsWith('c:')) return { companyId: Number(scope.slice(2)) };
  return {};
}
