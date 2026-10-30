import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';

import { templatesApi } from '@/services/api/templates';

import { templateKeys } from '../keys';
import { buildPreview } from '../preview';

/** Button labels of a sent template (from the template, cached; none if it's gone). */
export function TemplateButtons({ templateId }: { templateId: string }) {
  const t = useQuery({
    queryKey: templateKeys.detail(templateId),
    queryFn: () => templatesApi.get(templateId),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  if (!t.data) return null;
  const { buttons, hiddenButtons } = buildPreview(t.data.components, t.data.parameterFormat);
  if (!buttons.length) return null;
  return (
    <Box
      component="ul"
      aria-label="Template buttons"
      sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.5 }}
    >
      {buttons.map((b, i) => (
        <Box component="li" key={`${b.type}-${String(i)}`}>
          <Divider />
          <Typography variant="body2" color="primary" sx={{ textAlign: 'center', py: 0.5 }}>
            {b.text}
          </Typography>
        </Box>
      ))}
      {hiddenButtons > 0 && (
        <Box component="li">
          <Divider />
          <Typography variant="body2" color="primary" sx={{ textAlign: 'center', py: 0.5 }}>
            See all options
          </Typography>
        </Box>
      )}
    </Box>
  );
}
