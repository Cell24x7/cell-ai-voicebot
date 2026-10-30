import Badge from '@mui/material/Badge';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { NavLink } from 'react-router';

import type { NavItem } from './nav-config';

export interface NavEntryProps {
  item: NavItem;
  selected: boolean;
  onNavigate?: (() => void) | undefined;
  /** Count badge on the icon (hidden at 0, "99+" above 99). */
  count?: number;
}

export function NavEntry({ item, selected, onNavigate, count }: NavEntryProps) {
  return (
    <ListItemButton
      component={NavLink}
      to={item.path}
      selected={selected}
      onClick={onNavigate}
      aria-label={count ? `${item.label}, ${String(count)} unread` : undefined}
    >
      <ListItemIcon>
        {count === undefined ? (
          <item.icon />
        ) : (
          <Badge
            color="success"
            badgeContent={count}
            max={99}
            invisible={count === 0}
            slotProps={{ badge: { 'aria-hidden': true } }}
          >
            <item.icon />
          </Badge>
        )}
      </ListItemIcon>
      <ListItemText primary={item.label} />
    </ListItemButton>
  );
}
