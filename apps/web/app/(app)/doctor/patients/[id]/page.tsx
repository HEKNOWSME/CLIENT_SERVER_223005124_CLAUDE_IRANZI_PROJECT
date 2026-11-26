import { AssignedPatientHistory } from '../../../../../components/features/workspace/clinical';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignedPatientHistory id={id} />;
}
