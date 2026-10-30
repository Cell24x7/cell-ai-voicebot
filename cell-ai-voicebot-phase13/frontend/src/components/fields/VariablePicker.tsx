import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState, type RefObject } from 'react';

import { insertAtCaret } from './text-utils';

export interface PickerVariable {
  /** Inserted as `{{name}}`. */
  name: string;
  label: string;
  hint?: string;
}

/**
 * "Insert variable" menu for a text field: inserts `{{name}}` at the caret of
 * the field behind `inputRef` and puts the caret after it.
 */
export function VariablePicker({
  variables,
  value,
  onChange,
  inputRef,
  disabled,
  label = 'Insert variable',
}: {
  variables: PickerVariable[];
  value: string;
  onChange: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  disabled?: boolean;
  label?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (name: string) => {
    const el = inputRef.current;
    const next = insertAtCaret(value, name, el);
    onChange(next.value);
    setAnchor(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };
  return (
    <>
      <Button
        size="small"
        startIcon={<DataObjectOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={disabled || variables.length === 0}
        aria-haspopup="menu"
      >
        {label}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {variables.map((v) => (
          <MenuItem key={v.name} onClick={() => pick(v.name)}>
            <ListItemText primary={`{{${v.name}}}`} secondary={v.hint ?? v.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
