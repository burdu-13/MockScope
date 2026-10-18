
interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'admin' | 'editor' | 'viewer';
  orderCount: number;
  totalSpentCents: number;
  isActive: boolean;
  createdAt: string;
}

interface OrderItem {
  id: string;
  productName: string;
  priceCents: number;
}

declare const axios: any;

async function loadUsers() {
  const response = await fetch('/api/v1/users');
  return response.json();
}

async function getUserProfile(userId: string) {
  const response = await axios.get<UserProfile>(`/api/v1/users/${userId}`);
  return response.data;
}

async function createOrder(data: OrderItem) {
  const response = await fetch('/api/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer secret-jwt-token',
    },
    body: JSON.stringify(data),
  });
  return response.json();
}
