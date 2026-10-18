import { useReveal } from '../lib/useReveal'

const STEPS = [
  {
    n: '1',
    title: 'Understand',
    body: 'A fast model rewrites your question so it stands on its own ("is it safe for kids?" becomes "is neem safe for children?") and phrases it three different ways for search.',
  },
  {
    n: '2',
    title: 'Find',
    body: 'Those phrasings search the plant sheets and Wikipedia passages for that one species. Keyword and vector search are combined, so wording matters less.',
  },
  {
    n: '3',
    title: 'Answer',
    body: 'A larger model answers from the passages and cites one in every sentence. If they fall short, it may add a line of general knowledge, marked as such.',
  },
  {
    n: '4',
    title: 'Check',
    body: 'Sentences without a real citation are deleted before you see them. Doses, recipes and treatment plans are refused every time, no matter how the question is put.',
  },
]

export function Knowledge() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="section knowledge" ref={ref} aria-labelledby="knowledge-title">
      <div className="wrap">
        <p className="kicker" data-reveal>
          After the name
        </p>
        <h2 id="knowledge-title" className="section-title" data-reveal>
          Naming the plant is half the job. The other half is telling the <em>truth</em> about it.
        </h2>
        <div className="knowledge-grid">
          <p className="lede" data-reveal>
            The thesis version used a fine-tuned BART model to write a paragraph about each plant. It read well, but
            nothing in it was checked against anything. With plants like Dhutura, a sentence that sounds right and isn't
            could put someone in hospital.
          </p>
          <p className="lede" data-reveal>
            So that half was rebuilt as a retrieval pipeline. You can ask anything about the plant, follow up, and see
            exactly which passage each claim came from. When the sources don't cover something, you're told.
          </p>
        </div>
        <ol className="flow flow--4" aria-label="How an answer is made">
          {STEPS.map((s) => (
            <li key={s.n} data-reveal>
              <span className="flow-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
