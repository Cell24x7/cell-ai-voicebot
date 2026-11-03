import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { adminSystemApi } from '@/services/api/admin-system';
import type { SystemStatus } from '@/services/api/types';

/** The same limits healthwatch alerts on (backend `src/ops/health-rules.ts`). */
const BACKLOG = 1_000;
const BACKUP_MAX_HOURS = 26;
const CERT_MIN_DAYS = 14;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 170, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {children}
      </Typography>
    </Stack>
  );
}

function State({ good, label }: { good: boolean; label: string }) {
  return <Chip size="small" color={good ? 'success' : 'error'} variant="outlined" label={label} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

const backupFresh = (s: SystemStatus) =>
  Boolean(
    s.lastBackup?.ok && Date.now() - Date.parse(s.lastBackup.at) <= BACKUP_MAX_HOURS * 3_600_000,
  );

/** Superadmin `/admin/system`: the running build, database, Redis, queues and backups (Phase 17). */
export function AdminSystemPage() {
  const status = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => adminSystemApi.status(),
    refetchInterval: 30_000,
  });
  const s = status.data;
  return (
    <>
      <PageHeader title="System" subtitle="Production health. Refreshes every 30 seconds." />
      {status.isError && <Alert severity="error">The status could not be loaded.</Alert>}
      {!s && status.isPending && <Skeleton variant="rounded" height={240} />}
      {s && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Release">
              <Fact label="Commit">
                <code>{s.commit === 'unknown' ? 'unknown' : s.commit.slice(0, 12)}</code>
              </Fact>
              <Fact label="Built">
                {s.builtAt === 'unknown' ? 'unknown' : <RelativeTime value={s.builtAt} />}
              </Fact>
              <Fact label="Environment">{s.env}</Fact>
              <Fact label="Up for">{Math.round(s.uptimeSec / 60).toLocaleString('en-IN')} min</Fact>
              <Fact label="Last release">
                {s.lastRelease ? (
                  <>
                    {s.lastRelease.tag} · <RelativeTime value={s.lastRelease.at} />
                  </>
                ) : (
                  'Not recorded'
                )}
              </Fact>
            </Section>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Services">
              <Fact label="Database">
                <State
                  good={s.mongo.ok && s.mongo.primary}
                  label={!s.mongo.ok ? 'Not reachable' : s.mongo.primary ? 'Primary' : 'No primary'}
                />
                {s.mongo.version && ` MongoDB ${s.mongo.version}`}
              </Fact>
              <Fact label="Redis">
                <State good={s.redis.ok} label={s.redis.ok ? 'OK' : 'Not reachable'} />
                {s.redis.usedMemoryMb !== null && ` ${String(s.redis.usedMemoryMb)} MB`}
              </Fact>
              <Fact label="Certificate">
                {s.certificate ? (
                  <State
                    good={s.certificate.daysLeft >= CERT_MIN_DAYS}
                    label={`${String(s.certificate.daysLeft)} days left`}
                  />
                ) : (
                  'Not checked'
                )}
              </Fact>
              <Fact label="2FA">
                <State
                  good={s.superadminsWithoutMfa === 0}
                  label={
                    s.superadminsWithoutMfa === 0
                      ? 'Every superadmin'
                      : `${String(s.superadminsWithoutMfa)} superadmins without it`
                  }
                />
              </Fact>
            </Section>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Backups">
              <Fact label="Last backup">
                {s.lastBackup ? (
                  <>
                    <State good={backupFresh(s)} label={s.lastBackup.ok ? 'Done' : 'Failed'} />{' '}
                    <RelativeTime value={s.lastBackup.at} />
                    {s.lastBackup.ok && ` · ${(s.lastBackup.bytes / 1_048_576).toFixed(1)} MB`}
                  </>
                ) : (
                  <State good={false} label="None recorded" />
                )}
              </Fact>
              <Fact label="Last restore drill">
                {s.lastRestoreDrill ? (
                  <>
                    <RelativeTime value={s.lastRestoreDrill.at} /> ·{' '}
                    {String(s.lastRestoreDrill.rtoMinutes)} min to restore
                  </>
                ) : (
                  'None recorded'
                )}
              </Fact>
            </Section>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Queues">
              <Table size="small" aria-label="Queues">
                <TableHead>
                  <TableRow>
                    <TableCell>Queue</TableCell>
                    <TableCell align="right">Waiting</TableCell>
                    <TableCell align="right">Running</TableCell>
                    <TableCell align="right">Later</TableCell>
                    <TableCell align="right">Failed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(s.queues).map(([name, q]) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      {q.waiting < 0 ? (
                        <TableCell colSpan={4} align="right">
                          <State good={false} label="Not readable" />
                        </TableCell>
                      ) : (
                        <>
                          <TableCell
                            align="right"
                            sx={q.waiting > BACKLOG ? { color: 'error.main' } : undefined}
                          >
                            {q.waiting.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell align="right">{q.active.toLocaleString('en-IN')}</TableCell>
                          <TableCell align="right">{q.delayed.toLocaleString('en-IN')}</TableCell>
                          <TableCell align="right">{q.failed.toLocaleString('en-IN')}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </Grid>
        </Grid>
      )}
    </>
  );
}
