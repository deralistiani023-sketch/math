
export enum Topic {
  POLA_BILANGAN = 'Pola Bilangan',
  PECAHAN_DESIMAL = 'Pecahan dan Desimal',
  KUBUS_BALOK = 'Kubus dan Balok',
  RASIO = 'Rasio',
  PELUANG = 'Peluang'
}

export interface Question {
  id: string;
  topic: Topic;
  question: string;
  options: string[];
  correctAnswer: number; // Index
  hint: string;
  difficulty: 'Mudah' | 'Sedang' | 'Sulit';
}

export interface UploadedFile {
  name: string;
  type: string;
  size: string;
  url: string;
}

export interface Material {
  id: string;
  topic: Topic;
  title: string;
  content: string;
  files: UploadedFile[];
  createdAt: string;
}

export interface UserProgress {
  points: number;
  completedTopics: Topic[];
  quizHistory: Array<{
    topic: Topic;
    score: number;
    total: number;
    date: string;
  }>;
}

export interface AdminUser {
  email: string;
  isAuthenticated: boolean;
}

export interface Order {
  id?: string;
  customer_name: string;
  customer_email: string;
  product_name: string;
  amount: number;
  status: string;
  created_at?: string;
}
