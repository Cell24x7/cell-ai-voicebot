import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

import type { CustomField } from '@/services/api/types';

/** Shows / hides custom field columns in the contacts table. */
export function ColumnPicker({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[];
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <>
      <Button
        startIcon={<ViewColumnOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={!fields.length}
      >
        Columns
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {fields.map((f) => (
          <MenuItem key={f.key} onClick={() => toggle(f.key)} dense>
            <Checkbox size="small" checked={value.includes(f.key)} tabIndex={-1} disableRipple />
            <ListItemText primary={f.label} secondary={`{{${f.key}}}`} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
