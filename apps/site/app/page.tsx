import { BeforeAfter } from '../components/before-after';
import { Features } from '../components/features';
import { FinalCta } from '../components/final-cta';
import { Footer } from '../components/footer';
import { Hero } from '../components/hero';
import { Nav } from '../components/nav';
import { Pricing } from '../components/pricing';
import { StripeTape } from '../components/stripe-tape';

export default function HomePage() {
  return (
    <>
      <StripeTape />
      <Nav />
      <main>
        <Hero />
        <BeforeAfter />
        <Features />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
