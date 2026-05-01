import { redirect } from 'next/navigation';

export default function DashboardProductRedirect({ params }: { params: { id: string } }) {
  redirect(`https://masoret-website.vercel.app/products/${encodeURIComponent(params.id)}`);
}
