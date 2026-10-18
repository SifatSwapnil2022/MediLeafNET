import { Icon } from '../components/ui'

export function Credits() {
  const year = new Date().getFullYear()
  return (
    <footer className="credits">
      <div className="wrap credits-inner">
        <a className="credits-brand" href="#story">
          <Icon name="leaf" size={22} /> MediLeafNET
        </a>
        <nav className="links" aria-label="Links">
          <a href={`${import.meta.env.BASE_URL}playground`}>Playground</a>
          <a href="https://github.com/SifatSwapnil2022/MediLeafNET" target="_blank" rel="noreferrer">
            Code ↗
          </a>
          <a href="https://doi.org/10.17632/9tdc9gbtgb.2" target="_blank" rel="noreferrer">
            Dataset ↗
          </a>
          <a href="https://sifatswapnil2022.github.io/myWebsite/" target="_blank" rel="noreferrer">
            Portfolio ↗
          </a>
          <a href="https://www.linkedin.com/in/mdsifatullahsheikh/" target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
        </nav>
        <p className="copyright">© {year} Md Sifatullah Sheikh. All rights reserved.</p>
        <p className="tiny">Research demo, not medical advice.</p>
      </div>
    </footer>
  )
}
