import { PLANTS } from '../../shared/plants'
import { useReveal } from '../lib/useReveal'

const DOI = 'https://doi.org/10.17632/9tdc9gbtgb.2'

const FACTS = [
  ['4,063', 'original leaf photos'],
  ['13', 'species, all collected in Dhaka'],
  ['13,000', 'augmented images for training'],
  ['512 × 512', 'JPG, shot on iPhone 15 Pro Max and iPhone 14'],
]

export function Dataset() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="section dataset" id="dataset" ref={ref} aria-labelledby="dataset-title">
      <div className="wrap">
        <p className="kicker" data-reveal>
          The dataset
        </p>
        <h2 id="dataset-title" className="section-title" data-reveal>
          Every photo was taken by us, on foot.
        </h2>
        <p className="lede narrow" data-reveal>
          We collected leaves from the National Botanic Garden of Bangladesh, Boldha Garden in Wari, and Aftabnagar,
          between July and November, in natural daylight. Species were confirmed with help from the garden's staff and
          experts at the Bangladesh National Herbarium. The dataset is public, so anyone can check our work or build on
          it.
        </p>

        <dl className="facts">
          {FACTS.map(([n, label]) => (
            <div key={label} data-reveal>
              <dt>{n}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>

        <div className="row" data-reveal>
          <a className="btn btn--solid" href={DOI} target="_blank" rel="noreferrer">
            Open on Mendeley Data ↗
          </a>
          <span className="mono muted">DOI 10.17632/9tdc9gbtgb.2 · version 2, June 2026</span>
        </div>

        <h3 className="sub" data-reveal>
          The 11 species this model knows
        </h3>
        <p className="muted narrow" data-reveal>
          The model on this page was trained on 11 of the 13 species. Red tags mean poisonous.
        </p>
        <ul className="species">
          {PLANTS.map((p) => (
            <li key={p.id} data-reveal>
              <div className="species-text">
                <i>{p.sci}</i>
                <span>{p.local}</span>
              </div>
              {p.risk === 'danger' && <b className="tag tag--danger">Poisonous</b>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
