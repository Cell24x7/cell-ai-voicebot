import type { SvgIconComponent } from '@mui/icons-material';
import ApiOutlined from '@mui/icons-material/ApiOutlined';
import CallEndOutlined from '@mui/icons-material/CallEndOutlined';
import CallSplitOutlined from '@mui/icons-material/CallSplitOutlined';
import DialpadOutlined from '@mui/icons-material/DialpadOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import HearingOutlined from '@mui/icons-material/HearingOutlined';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import PhoneForwardedOutlined from '@mui/icons-material/PhoneForwardedOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import RecordVoiceOverOutlined from '@mui/icons-material/RecordVoiceOverOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';

import type { FlowNodeType } from '@/services/api/types';

export const NODE_ICONS: Record<FlowNodeType, SvgIconComponent> = {
  start: FlagOutlined,
  speak: RecordVoiceOverOutlined,
  play_audio: PlayCircleOutline,
  gather_dtmf: DialpadOutlined,
  gather_speech: HearingOutlined,
  ai_agent: SmartToyOutlined,
  api_request: ApiOutlined,
  condition_router: CallSplitOutlined,
  set_variable: EditNoteOutlined,
  set_disposition: LabelOutlined,
  transfer_to_agent: PhoneForwardedOutlined,
  send_sms: SmsOutlined,
  send_whatsapp: WhatsApp,
  wait: HourglassEmptyOutlined,
  hangup: CallEndOutlined,
};

export const GROUP_LABELS: Record<string, string> = {
  start: 'Start',
  say_listen: 'Say & listen',
  ai: 'AI',
  logic: 'Logic',
  actions: 'Actions',
  end: 'End',
};
