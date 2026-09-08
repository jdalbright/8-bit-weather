import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { SceneState } from '../types';
import type { Landscape } from '../lib/landscapes';
import { anchors } from '../lib/scene';

// The two paintings share their creek composition. Keep motion inside the water,
// inset from the banks and rocks, in the same scene grid as the raster artwork.
const water = 'M644 674 L621 674 L607 680 L575 682 L551 686 L514 692 L470 695 L468 699 L514 707 L547 714 L567 723 L614 737 L647 750 L660 760 L687 775 L717 790 L728 801 L926 801 L907 793 L875 789 L850 784 L825 774 L803 771 L783 762 L751 759 L735 750 L705 745 L682 736 L650 731 L629 723 L604 719 L594 713 L577 707 L559 705 L548 700 L552 696 L564 693 L586 689 L607 685 L622 680 L646 678 Z';

const currents = [
  'M644 675 C614 680 596 683 568 687 S490 694 486 697 S554 708 580 721 S650 746 677 766 S716 790 740 807',
  'M642 676 C612 682 588 683 564 689 S511 694 515 699 S572 712 599 724 S666 745 700 766 S750 792 774 812',
  'M638 677 C606 683 580 685 560 691 S527 698 544 702 S583 713 619 727 S691 750 722 768 S782 796 814 812',
  'M630 677 C607 682 578 687 560 692 S541 699 554 703 S602 718 638 731 S709 751 752 773 S820 796 854 812',
  'M614 681 C588 688 566 690 557 695 S556 701 570 706 S620 720 654 733 S730 755 778 775 S853 797 889 812',
];
const eddies = [[538, 700, .55], [617, 719, .7], [710, 741, .9], [769, 765, 1], [861, 793, 1.2]];
const rainRipples = [[568, 703], [648, 732], [789, 766]];

export function Stream({ scene, landscape, discoveryId }: {
  scene: SceneState; landscape: Landscape; discoveryId?: number;
}) {
  const clipId = `stream-${useId().replace(/:/g, '')}`;
  const rain = scene.kind === 'rain' || scene.kind === 'storm';
  // Weather changes the surface's character, not a claimed measurement of flow.
  const energy = rain ? scene.precipitationIntensity : 0;
  const style = {
    '--stream-duration': `${4.2 - energy * .8}s`,
    '--stream-light': `rgb(${Math.round(130 + scene.daylight * 80)} ${Math.round(163 + scene.daylight * 73)} ${Math.round(231 + scene.daylight * 12)})`,
    '--stream-blue': `rgb(${Math.round(22 + scene.daylight * 30)} ${Math.round(62 + scene.daylight * 79)} ${Math.round(151 + scene.daylight * 48)})`,
    '--stream-opacity': .5 + energy * .12,
  } as CSSProperties;
  return <g className="stream" data-landscape={landscape} style={style}>
    <defs><clipPath id={clipId}><path className="stream-waterline" d={water}/></clipPath></defs>
    <g className="stream-water" clipPath={`url(#${clipId})`}>
      <g className="stream-depth">{currents.map((d, i) => <path key={i} className="stream-current stream-undercurrent" d={d}
        style={{ animationDelay: `${-i * .73}s` }} />)}</g>
      <g className="stream-reflections">{currents.map((d, i) => <path key={i} className="stream-current stream-highlight" d={d}
        style={{ animationDelay: `${-i * .91}s`, strokeWidth: 2 + i % 3, '--stream-duration': `${3.5 + i * .31 - energy * .65}s` } as CSSProperties} />)}</g>
      <g className="stream-eddies">{eddies.map(([x, y, scale], i) => <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
        <path className="stream-eddy" d="M-15-2h12v-2h11v2h8v3h-5m-23 3h16v2h9" style={{ animationDelay: `${-i * .51}s` }}/>
      </g>)}</g>
      {rain ? <g className="rain-ripples">{rainRipples.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}>
        <path className="river-ring ambient-ripple" d="M-18 0h-8v4h8m36-4h8v4h-8M-18-3h36M-18 7h36" style={{ animationDelay: `${i * -.8}s` }}/>
      </g>)}</g> : null}
      {discoveryId !== undefined ? <g transform={`translate(${anchors.river.x} ${anchors.river.y})`}>
        <g key={discoveryId} className="river-discovery"><path className="river-ring" d="M-23-4h46M-23 7h46M-23-1h-8v4h8m46-4h8v4h-8"/><path className="river-ring inner-ring" d="M-11-1h22M-11 4h22"/></g>
      </g> : null}
    </g>
  </g>;
}
