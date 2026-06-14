import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="ring ra" /> <span className="ring rb" />
        <div className="wrap">
          <div className="top">
            <div className="brand"><span className="m">M</span>MindBridge</div>
            <Link href="/admin/" className="btn btn-ghost" style={{ padding: "8px 16px" }}>
              Practitioner
            </Link>
          </div>
          <h1>A quiet, secure space to <em>talk it through</em>.</h1>
          <p>
            Book a private one-to-one session by voice or chat, with a timer you both can
            see. Pay in naira. Bring the one or two things on your mind.
          </p>
          <div className="row">
            <Link href="/book/" className="btn btn-amber">Book a session</Link>
            <a href="#how" className="btn btn-ghost">How it works</a>
          </div>
          <div className="tags">
            <span><span className="d" /> Encrypted &amp; private</span>
            <span><span className="d" /> Pay per session (₦)</span>
            <span><span className="d" /> 30 minutes</span>
            <span><span className="d" /> No recordings</span>
          </div>
        </div>
      </section>

      <div className="wrap" id="how">
        <div className="page-head">
          <div className="lbl">How a session works</div>
          <h2>Simple to book, calm to attend.</h2>
        </div>
        <div className="three">
          <div className="c"><div className="n">Step one</div><h3>Pick a time</h3><p>Choose any open slot in the next two weeks, in your own time.</p></div>
          <div className="c"><div className="n">Step two</div><h3>Pay &amp; confirm</h3><p>Pay securely in naira by card, bank transfer, OPay or PalmPay.</p></div>
          <div className="c"><div className="n">Step three</div><h3>Join the room</h3><p>At your time, join a private room with voice, chat and a shared countdown.</p></div>
        </div>
      </div>
    </>
  );
}
