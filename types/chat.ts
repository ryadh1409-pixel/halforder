export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'system';
  createdAt?: number;
}

export interface ChatThread {
  id: string;
  orderId?: string;
  members: string[];
}
