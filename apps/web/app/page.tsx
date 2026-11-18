import { ConnectionStatus } from './connection-status';

export default function Home() {
  return <main className="workspace">
    <header className="masthead"><a className="brand" href="/">PM<span>+</span>RMS</a><span className="environment">Local development</span></header>
    <section className="intro"><p className="eyebrow">PATIENT MEDICAL RECORDS MANAGEMENT SYSTEM</p>
      <h1>A connected foundation<br />for better patient records.</h1>
      <p className="description">Your project starts here. Check the connection from this browser to the API and local PostgreSQL database.</p>
    </section>
    <ConnectionStatus />
    <section className="next-steps"><div><p className="eyebrow">WHAT COMES NEXT</p><h2>Build the patient experience.</h2></div>
      <p>This workspace verifies the local infrastructure. Authentication, role permissions, medical records, private documents and realtime notifications will be added in the next development stages.</p>
    </section>
    <footer>PMRMS <span>Academic project · Infrastructure setup</span></footer>
  </main>;
}
