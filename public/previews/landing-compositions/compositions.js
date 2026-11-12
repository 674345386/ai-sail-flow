// Geometric composition studies: no photographic assets, materials or lighting.
export const compositions = [
  {
    id: 'A', name: '海岸弯道', lens: '28 mm', horizon: 336,
    scale: '车占画宽 7%', space: '左侧留白 38%',
    description: '沿用你偏好的海岸公路，进一步缩小汽车，用崖壁、弯道和海平面拉开空间。',
    subject: 'small silver car',
    brief: 'Wide coastal road after rain, a small car in the right lower third, 28mm environmental shot, sweeping road into the distance, broad sea horizon, left 38% quiet for copy. Keep the car at 7% of frame width.',
    shape: `
      <path fill="#e5e5e5" d="M0 336H2000V840H0Z"/>
      <path fill="#ededed" d="M650 336 820 270 990 297 1180 330 1320 336Z"/>
      <path fill="#d3d3d3" d="M0 80 210 110 380 238 520 303 690 327 880 363 1000 404 970 461 800 489 630 544 540 620 0 780Z"/>
      <path fill="#bdbdbd" d="M0 373 200 417 360 495 580 539 736 610 920 685 950 840H0Z"/>
      <path fill="#f7f7f7" stroke="#aaa" stroke-width="2" d="M430 840C605 716 1184 680 1294 603S1420 494 1170 453C1080 438 1008 424 990 400L1019 397C1052 423 1181 427 1270 444C1532 494 1627 562 1484 645S1222 790 1195 840Z"/>
      <path fill="none" stroke="#d0d0d0" stroke-width="3" d="M811 840C858 756 1393 664 1417 570S1125 447 1006 399"/>
      <path fill="none" stroke="#ccc" stroke-width="2" d="M1640 389H1940M1590 422H1850"/>
      <use href="#car" x="1346" y="530" width="140" height="67"/>
    `,
  },
  {
    id: 'B', name: '高山公路', lens: '24 mm', horizon: 360,
    scale: '车占画宽 6%', space: '左侧留白 36%',
    description: '让两侧山体形成前景框架，公路带视线进入远处。空间纵深强，适合品牌宣传片。',
    subject: 'small touring car',
    brief: 'Wide alpine pass, layered mountains and a winding road, tiny car in the right lower third, 24mm environment-led view, foreground mountain frame, deep readable valley, left copy-safe region. Car width 6% of frame.',
    shape: `
      <path fill="#ededed" d="M0 358 204 240 440 140 610 310 820 215 1000 353 1165 183 1340 92 1518 267 1700 212 2000 350V840H0Z"/>
      <path fill="#dcdcdc" d="M0 486 252 375 535 450 780 389 1045 483 1300 327 1525 416 1785 330 2000 445V840H0Z"/>
      <path fill="#c5c5c5" d="M0 143 156 85 365 165 462 295 570 395 734 452 800 565 1044 680 1200 840H0Z"/>
      <path fill="#d0d0d0" d="M2000 330 1773 403 1615 491 1477 570 1460 692 1620 840H2000Z"/>
      <path fill="#f8f8f8" stroke="#aaa" stroke-width="2" d="M1570 840C1417 718 1155 667 1164 580S1510 476 1290 394L1311 373C1627 472 1427 542 1330 586S1507 724 1910 840Z"/>
      <path fill="none" stroke="#d0d0d0" stroke-width="3" d="M1740 840C1490 717 1239 660 1247 584S1580 473 1302 385"/>
      <use href="#car" x="1205" y="529" width="120" height="58"/>
    `,
  },
  {
    id: 'C', name: '荒原直线', lens: '35 mm', horizon: 310,
    scale: '车占画宽 4.8%', space: '左侧留白 44%',
    description: '低地平线、大面积天空和偏置消失点。主体更小、构图更安静，开阔感最直接。',
    subject: 'distant off-road vehicle',
    brief: 'Expansive arid plateau with low horizon and huge open sky, a single offset road receding to a distant small vehicle, 35mm panoramic environmental frame, quiet left 44% for copy. Vehicle width 4.8% of frame.',
    shape: `
      <path fill="#ededed" d="M0 310 170 290 320 300 470 270 670 286 870 308 1030 295 1275 307 1470 272 1650 289 1840 299 2000 285V840H0Z"/>
      <path fill="#dcdcdc" d="M0 353C380 333 710 357 1030 331S1710 336 2000 320V840H0Z"/>
      <path fill="#d0d0d0" d="M0 600C270 526 485 580 680 579S1036 530 1140 581L960 840H0Z"/>
      <path fill="#e5e5e5" d="M1418 481C1580 451 1740 479 2000 450V840H1560Z"/>
      <path fill="#f8f8f8" stroke="#aaa" stroke-width="2" d="M510 840 1249 314H1262L1470 840Z"/>
      <path fill="none" stroke="#ccc" stroke-width="3" d="M990 840 1255 314"/>
      <use href="#car" x="1200" y="394" width="96" height="46"/>
    `,
  },
  {
    id: 'D', name: '建筑广场', lens: '28 mm', horizon: 380,
    scale: '人物占画高 9%', space: '左侧留白 40%',
    description: '用建筑体量与一个很小的人物建立尺度。空间整洁、线条克制，适合设计与生活方式内容。',
    subject: 'small person in architectural plaza',
    brief: 'Wide architectural plaza with a large restrained modern pavilion in the right third and one small person for scale, 28mm perspective, extensive clear ground plane, left 40% quiet copy space. Person height about 9% of frame.',
    shape: `
      <path fill="#ededed" d="M0 380 220 351 422 367 615 332 790 350 1005 380H2000V840H0Z"/>
      <path fill="#e2e2e2" d="M0 482 2000 404V840H0Z"/>
      <path fill="#f7f7f7" stroke="#b5b5b5" stroke-width="2" d="M1110 299 1665 206 1960 329 1424 438Z"/>
      <path fill="#f0f0f0" stroke="#b5b5b5" stroke-width="2" d="M1110 299V527L1424 636V438Z"/>
      <path fill="#d0d0d0" stroke="#b5b5b5" stroke-width="2" d="M1424 438 1960 329V514L1424 636Z"/>
      <path fill="#bdbdbd" d="M1482 445 1875 366V484L1482 576Z"/>
      <path fill="#ededed" d="M1511 440V568L1525 565V438Z"/>
      <path fill="#f7f7f7" stroke="#bbb" stroke-width="2" d="M1110 527 1424 636 2000 501V555L1424 709 1022 557Z"/>
      <path fill="none" stroke="#c8c8c8" stroke-width="2" d="M1424 709 1002 840M1022 557 0 717M1850 595 1840 840"/>
      <use href="#person" x="1210" y="486" width="28" height="76"/>
    `,
  },
  {
    id: 'E', name: '海面帆影', lens: '35 mm', horizon: 352,
    scale: '帆船占画宽 5.8%', space: '左侧留白 44%',
    description: '长海平线与小帆船构成极简远景。几乎没有前景遮挡，适合安静、舒展的品牌画面。',
    subject: 'small sailboat on an open sea',
    brief: 'Expansive quiet sea with a long uninterrupted horizon and one small sailboat to the right, low distant headland at far left, 35mm panoramic shot, large empty water and sky, left 44% copy-safe. Boat width 5.8% of frame.',
    shape: `
      <path fill="#e8e8e8" d="M0 352H2000V840H0Z"/>
      <path fill="#ddd" d="M0 300 120 277 255 298 338 334 510 352H0Z"/>
      <path fill="#d0d0d0" d="M0 599 72 574 170 607 266 648 335 755 390 840H0Z"/>
      <path fill="none" stroke="#d2d2d2" stroke-width="2" d="M700 526H1020M1060 663H1330M1470 582H1810M375 731H810"/>
      <g stroke="#929292" stroke-width="2.5" stroke-linejoin="round">
        <path fill="#fafafa" d="M1341 491 1457 491 1436 515H1367Z"/>
        <path fill="none" d="M1393 491V373"/>
        <path fill="#fafafa" d="M1385 386 1346 480H1385Z"/>
        <path fill="#f3f3f3" d="M1401 402 1439 480H1401Z"/>
      </g>
    `,
  },
  {
    id: 'F', name: '湖畔远景', lens: '24 mm', horizon: 330,
    scale: '人物占画高 8%', space: '左侧留白 38%',
    description: '远山、湖面和岸线分成三层，人物只作尺度参照。环境叙事更强，适合户外与人物故事。',
    subject: 'small lone walker by a lake',
    brief: 'Wide highland lake surrounded by layered distant mountains, a quiet curving shore leading to one small lone walker at right, 24mm environmental composition, open lake on left for copy, person height 8% of frame. Environment should dominate.',
    shape: `
      <path fill="#ededed" d="M0 330 145 237 307 279 510 152 702 274 887 215 1070 335 1268 205 1445 265 1690 173 2000 310V840H0Z"/>
      <path fill="#dcdcdc" d="M0 403 215 342 427 386 663 335 905 411 1125 363 1370 405 1615 319 1800 373 2000 358V840H0Z"/>
      <path fill="#efefef" d="M0 474C351 425 781 448 1100 464S1490 466 1630 454C1441 526 1254 541 1090 592S808 701 943 840H0Z"/>
      <path fill="#c8c8c8" d="M2000 441 1665 463C1510 529 1464 586 1264 639S1185 754 1310 840H2000Z"/>
      <path fill="#b8b8b8" d="M0 683 204 641 313 699 464 732 607 840H0Z"/>
      <path fill="#fafafa" stroke="#aaa" stroke-width="2" d="M1448 840C1370 744 1350 690 1452 621S1635 514 1674 474L1689 474C1686 534 1545 597 1534 666S1570 775 1660 840Z"/>
      <use href="#person" x="1483" y="563" width="25" height="67"/>
    `,
  },
];

const symbols = `
  <defs>
    <symbol id="car" viewBox="0 0 180 86">
      <g stroke="#777" stroke-width="2" stroke-linejoin="round">
        <path fill="#fafafa" d="M12 48 32 41 59 16H111L141 39 166 47 173 59 168 70H12Z"/>
        <path fill="#d3d3d3" d="M44 42 66 22H105L128 42Z"/>
        <path fill="none" d="M92 23V42M17 55H164"/>
        <circle fill="#b3b3b3" cx="43" cy="69" r="12"/><circle fill="#b3b3b3" cx="143" cy="69" r="12"/>
        <circle fill="#e8e8e8" cx="43" cy="69" r="5"/><circle fill="#e8e8e8" cx="143" cy="69" r="5"/>
      </g>
    </symbol>
    <symbol id="person" viewBox="0 0 32 86">
      <g stroke="#818181" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle fill="#fafafa" cx="16" cy="10" r="7"/>
        <path fill="#fafafa" d="M8 24 23 23 25 49 19 53 8 49Z"/>
        <path fill="none" stroke-width="5" d="M10 53 8 79M21 54 27 79M6 27 3 47M25 27 30 45"/>
      </g>
    </symbol>
  </defs>`;

export function compositionSVG(frame, { guides = false, copy = false } = {}) {
  const definitions = symbols.replaceAll('id="car"', `id="${frame.id}-car"`).replaceAll('id="person"', `id="${frame.id}-person"`);
  const shapes = frame.shape.replaceAll('href="#car"', `href="#${frame.id}-car"`).replaceAll('href="#person"', `href="#${frame.id}-person"`);
  const guideOverlay = guides ? `
    <g fill="none" stroke="#8a8a8a" stroke-width="2" stroke-dasharray="12 12" opacity=".8">
      <path d="M666.67 0V840M1333.33 0V840M0 280H2000M0 560H2000"/>
      <rect x="90" y="180" width="670" height="485"/>
    </g>
    <path d="M0 ${frame.horizon}H2000" stroke="#777" stroke-width="2" stroke-dasharray="4 10"/>
    <text x="1860" y="${frame.horizon - 16}" fill="#555" font-size="19">视平线</text>
    <text x="108" y="163" fill="#555" font-size="21">文案安全区</text>` : '';
  const copyOverlay = copy ? `
    <g fill="#333" font-family="PingFang SC, Microsoft YaHei, sans-serif">
      <text x="114" y="318" font-size="69" font-weight="600">让你的创意，</text>
      <text x="114" y="413" font-size="69" font-weight="600">成为目光的焦点。</text>
      <text x="118" y="492" fill="#666" font-size="27">从一句想法，到下一支作品。</text>
      <rect x="116" y="553" width="237" height="70" fill="#fafafa" stroke="#777" stroke-width="2"/>
      <text x="145" y="598" font-size="26">开始创作 →</text>
    </g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 840" width="2000" height="840" role="img" aria-labelledby="${frame.id}-scene-title ${frame.id}-scene-description">
    <title id="${frame.id}-scene-title">${frame.id} ${frame.name} · 远景构图白模</title>
    <desc id="${frame.id}-scene-description">${frame.description}</desc>
    ${definitions}<rect width="2000" height="840" fill="#fafafa"/>${shapes}${guideOverlay}${copyOverlay}
  </svg>`;
}
