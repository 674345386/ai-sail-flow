import type { AgentMessage, AgentMessageImage } from './agent-message';
import type { RadarInput, RadarCalendarEvent } from './radar';
export type RadarSpaceState = {
 id:string;title:string;createdAt:string;updatedAt:string;
 status:'idle'|'running'|'failed';provider:string;model:string;effort:string;
 messages:AgentMessage[];images:AgentMessageImage[];scope:RadarInput;
 runIds:string[];activeRunId?:string;activity?:string;error?:string;
 threadId?:string;turnId?:string;instructionsVersion?:string;queuePaused?:boolean;
 calendar?:{region:string;events:RadarCalendarEvent[];updatedAt:string};
 report?:{title:string;markdown:string;runIds:string[];updatedAt:string};
 workspace?:{nodes:{id:string;type:string;name:string;description:string;x:number;y:number;width:number;height?:number;sourceId?:string}[];hiddenIds:string[];viewMode:'canvas'|'list';collapsed:boolean;chatWide:boolean;settings:Record<string,boolean|number>;candidates:string[]};
};
