import { RecordDetail } from '../../../../../components/features/workspace/clinical';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordDetail role="doctor" id={id} />;
}
