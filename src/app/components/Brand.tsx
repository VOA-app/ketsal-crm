// Логотип и силуэт птицы из брендбука. Цвета знака задаются классами, чтобы работала тёмная тема.
import logoSvg from '../../design/assets/logo.svg?raw';
import birdSvg from '../../design/assets/bird.svg?raw';

const logoInner = logoSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/fill="#2B2223"/g, 'class="lg-w"')
  .replace(/fill="#217870"/g, 'class="lg-b"')
  .replace(/fill="#D00405"/g, 'class="lg-r"');

const birdInner = birdSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/fill="#217870"/g, 'fill="currentColor"');

export function Logo({ label }: { label: string }) {
  return (
    <svg
      className="logo"
      viewBox="431 781.6 2212.7 821.8"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: logoInner }}
    />
  );
}

export function Bird() {
  return (
    <svg
      className="bird"
      viewBox="0 0 2213 442"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: birdInner }}
    />
  );
}
