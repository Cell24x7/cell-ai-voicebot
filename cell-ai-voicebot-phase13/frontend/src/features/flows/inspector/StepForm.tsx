import type { ComponentType } from 'react';

import type { DraftGraph, DraftNode, FlowCatalog, FlowVariableInfo } from '@/services/api/types';

import type { StepFormProps } from './form-types';
import { AiAgentForm } from './forms/ai';
import {
  DispositionForm,
  HangupForm,
  PlayAudioForm,
  SmsForm,
  SpeakForm,
  StartForm,
  TransferForm,
  WaitForm,
  WhatsappForm,
} from './forms/basic';
import { GatherDtmfForm, GatherSpeechForm } from './forms/gather';
import { ApiRequestForm, RouterForm, SetVariableForm } from './forms/logic';
import { pickerVariables } from './picker-variables';

const FORMS: Record<DraftNode['type'], ComponentType<StepFormProps>> = {
  start: StartForm,
  speak: SpeakForm,
  play_audio: PlayAudioForm,
  gather_dtmf: GatherDtmfForm,
  gather_speech: GatherSpeechForm,
  ai_agent: AiAgentForm,
  api_request: ApiRequestForm,
  condition_router: RouterForm,
  set_variable: SetVariableForm,
  set_disposition: DispositionForm,
  transfer_to_agent: TransferForm,
  send_sms: SmsForm,
  send_whatsapp: WhatsappForm,
  wait: WaitForm,
  hangup: HangupForm,
};

/** The settings form of one step. */
export function StepForm({
  node,
  apply,
  readOnly,
  graph,
  fieldErrors,
  catalog,
  known,
}: {
  node: DraftNode;
  apply: (config: Record<string, unknown>) => void;
  readOnly: boolean;
  graph: DraftGraph;
  fieldErrors: Record<string, string>;
  catalog: FlowCatalog;
  known: FlowVariableInfo[] | undefined;
}) {
  const Form = FORMS[node.type];
  const variables = pickerVariables(known, graph, node.type);
  return (
    <Form
      key={node.id}
      config={node.config}
      set={(patch) => apply({ ...node.config, ...patch })}
      errors={fieldErrors}
      variables={variables}
      flowVariables={graph.variables}
      allNames={variables.filter((v) => !v.name.includes('.')).map((v) => v.name)}
      catalog={catalog}
      readOnly={readOnly}
    />
  );
}
