import { createTheme } from '@mui/material/styles';

// Brand colors pending — placeholder palette until the client / design confirms branding.
const PRIMARY = '#1d5fa3';
const SECONDARY = '#0f9d8a';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: PRIMARY },
        secondary: { main: SECONDARY },
        background: { default: '#f6f8fb', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#6aa6e8' },
        secondary: { main: '#4fd1bd' },
        background: { default: '#0f141b', paper: '#161d27' },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
});
