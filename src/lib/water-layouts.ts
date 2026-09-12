export type WaterLayout = {
  kind: 'stream' | 'surf';
  mask: string;
  currents: string[];
  eddies: number[][];
  rainRipples: number[][];
  anchor: { x: number; y: number };
  duration: number;
  opacity: number;
  label: string;
};

// The original meadow and Raleigh creek geometry, preserved for existing plates.
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

export const creek: WaterLayout = {
  kind: 'stream', mask: water, currents, eddies, rainRipples,
  anchor: { x: 701, y: 744 }, duration: 4.2, opacity: .5, label: 'Make a river ripple',
};

// Raleigh's painted creek is wider than the original shared center-current mask.
// A pixel coverage mask in RaleighRiverSurface excludes rocks inside this outline.
export const raleighCreek: WaterLayout = {
  ...creek,
  mask: 'M650 668L565 668L552 679L517 686L477 693L450 697L411 698L414 710L445 722L481 729L510 743L539 755L568 769L608 783L641 790L664 801H960L942 787L905 775L869 769L838 759L808 750L779 743L747 729L716 720L679 710L641 701L600 695L582 695L604 687L638 681L650 676Z',
};

export const woodlandCreek: WaterLayout = {
  ...creek,
  mask: 'M583 678L553 682L534 689L489 694L477 699L505 711L541 727L580 741L616 755L675 774L708 801H793L816 787L810 778L788 772L781 758L754 750L727 740L702 730L672 723L651 717L620 711L598 703L577 696L559 693L574 686L599 680Z',
  currents: [
    'M583 679C560 683 545 690 504 696S515 712 548 730S612 753 682 781S709 799 735 813',
    'M584 680C558 686 524 690 496 698S540 719 574 735S642 758 709 783S745 804 768 811',
    'M584 681C559 688 535 693 515 701S559 723 597 740S670 762 738 788S778 804 795 813',
    'M584 682C560 690 550 696 533 704S582 724 621 743S699 767 773 791S807 805 826 813',
  ],
  eddies: [[518, 711, .6], [588, 734, .7], [699, 750, .9], [766, 777, 1]],
  rainRipples: [[542, 712], [648, 743], [768, 781]],
};

// Conservative water interiors traced against the delivered 960x801 plates.
// Banks/reeds stay outside the clip even as highlights and tap rings travel.
export const slowRiver: WaterLayout = {
  kind: 'stream',
  mask: 'M544 605L689 605L689 628L776 640L883 653L960 665V801H711L699 774L670 768L659 741L619 732L589 727L568 711L570 686L542 676L527 657L495 646L486 631L511 618Z',
  currents: [
    'M528 614C595 617 655 620 707 626S829 646 964 659',
    'M509 638C588 649 665 654 761 672S875 689 973 695',
    'M559 676C636 680 733 700 821 723S918 739 977 743',
    'M591 721C682 729 742 750 828 771S940 791 980 795',
    'M697 781C754 785 804 803 879 809',
  ],
  eddies: [], rainRipples: [[615, 657], [744, 700], [849, 762]],
  anchor: { x: 765, y: 737 }, duration: 8, opacity: .28, label: 'Make a river ripple',
};

export const ocean: WaterLayout = {
  kind: 'surf',
  mask: 'M258 483H960V801H930L861 769L785 733L711 710L660 678L609 663L565 635L534 613L486 597L461 579L423 565L391 548L353 534L322 518L289 512Z',
  currents: [
    'M265 494C459 497 619 499 982 502',
    'M321 518C471 531 641 528 982 539',
    'M412 558C583 574 747 562 982 581',
    'M507 609C644 624 802 621 985 638',
    'M626 669C759 685 871 686 987 704',
    'M771 741C857 756 920 764 987 778',
  ],
  eddies: [], rainRipples: [[530, 544], [751, 618], [853, 719]],
  anchor: { x: 773, y: 673 }, duration: 6, opacity: .55, label: 'Make a splash in the surf',
};
