import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Link,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useCan } from '@/features/auth/hooks';
import { useExportJob } from '@/features/contact-exports/useExportJob';
import { campaignsApi } from '@/services/api/campaigns';
import { getErrorMessage } from '@/services/api/errors';

import { useCanExportCampaigns } from '../queries';

/** Results export: CSV / XLSX → live progress → download link (campaigns.export). */
export function ExportButton({ campaignId }: { campaignId: string }) {
  const canExport = useCanExportCampaigns();
  const fullPhones = useCan()('contacts.export');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [jobId, setJobId] = useState<string | undefined>();
  const start = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => campaignsApi.exportResults(campaignId, format),
    meta: { silent: true },
    onSuccess: (job) => setJobId(job.id),
  });
  const job = useExportJob(jobId);
  if (!canExport) return null;
  const j = job.data;
  const pct =
    j && j.progress.total ? Math.round((j.progress.processed / j.progress.total) * 100) : 0;
  const choose = (format: 'csv' | 'xlsx') => {
    setAnchor(null);
    setJobId(undefined);
    start.mutate(format);
  };
  return (
    <>
      <Button startIcon={<FileDownloadOutlined />} onClick={(e) => setAnchor(e.currentTarget)}>
        Export
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => choose('csv')}>CSV</MenuItem>
        <MenuItem onClick={() => choose('xlsx')}>Excel (XLSX)</MenuItem>
      </Menu>
      <Dialog
        open={start.isPending || Boolean(start.error) || Boolean(jobId)}
        onClose={() => {
          setJobId(undefined);
          start.reset();
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Export results</DialogTitle>
        <DialogContent>
          {start.error && <Alert severity="error">{getErrorMessage(start.error)}</Alert>}
          {(start.isPending || (j && (j.status === 'pending' || j.status === 'processing'))) && (
            <>
              <Typography variant="body2" gutterBottom>
                Preparing the file…{' '}
                {j ? `${String(j.progress.processed)} / ${String(j.progress.total)}` : ''}
              </Typography>
              <LinearProgress variant={j ? 'determinate' : 'indeterminate'} value={pct} />
            </>
          )}
          {j?.status === 'ready' && j.downloadUrl && (
            <Link href={j.downloadUrl} download>
              Download ({String(j.rowCount)} rows)
            </Link>
          )}
          {j?.status === 'failed' && (
            <Alert severity="error">
              {j.errorMessage ?? 'The export failed — please try again.'}
            </Alert>
          )}
          {!fullPhones && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Phone numbers are shortened (exporting full numbers needs the contacts export
              permission).
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setJobId(undefined);
              start.reset();
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
