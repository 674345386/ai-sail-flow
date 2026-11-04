export type AgentMessageImage = { id: string; name: string; url: string; filename?: string; mime?: string };
export type AgentMessage = {
  id: string;
  itemId?: string;
  role: 'user' | 'assistant' | 'event';
  text: string;
  createdAt: string;
  images?: AgentMessageImage[];
};
