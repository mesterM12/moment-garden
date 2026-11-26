import type { Ref } from 'react'
import { bandPath, cloth } from './ribbon-cloth'

export function SilkBow({ plate }: { plate: Ref<SVGSVGElement> }) {
  return (
    <svg ref={plate} className="parcel-bow" aria-hidden="true" viewBox="0 0 380 198" fill="none" strokeLinejoin="round">
      <defs>
        <linearGradient id="parcel-silk" x1=".1" y1="0" x2=".85" y2=".95"><stop stopColor="#712e45"/><stop offset=".22" stopColor="#af6075"/><stop offset=".4" stopColor="#d28b96"/><stop offset=".52" stopColor="#ae5e71"/><stop offset=".78" stopColor="#823c52"/><stop offset="1" stopColor="#55263b"/></linearGradient>
        <linearGradient id="parcel-loop" x2=".28" y2="1"><stop stopColor="#733249"/><stop offset=".27" stopColor="#ad6372"/><stop offset=".51" stopColor="#d2949c"/><stop offset=".74" stopColor="#ae6376"/><stop offset="1" stopColor="#703046"/></linearGradient>
        <linearGradient id="parcel-tail" x1="0" y1=".1" x2="1" y2=".86"><stop stopColor="#7b324a"/><stop offset=".28" stopColor="#a75a6c"/><stop offset=".54" stopColor="#cb939d"/><stop offset=".66" stopColor="#a6596e"/><stop offset="1" stopColor="#91475e"/></linearGradient>
        <linearGradient id="parcel-lining" x2=".86" y2="1"><stop stopColor="#512639"/><stop offset=".62" stopColor="#73354d"/><stop offset="1" stopColor="#a85f75"/></linearGradient>
        <linearGradient id="parcel-band-face" x1="0" y1="63" x2="0" y2="97" gradientUnits="userSpaceOnUse" spreadMethod="reflect"><stop stopColor="#96556a"/><stop offset=".09" stopColor="#c88e9a"/><stop offset=".43" stopColor="#b67787"/><stop offset=".85" stopColor="#a9687c"/><stop offset="1" stopColor="#905065"/></linearGradient>
        <linearGradient id="parcel-knot" x2="1" y2=".3"><stop stopColor="#703047"/><stop offset=".24" stopColor="#a8586a"/><stop offset=".46" stopColor="#d38e98"/><stop offset=".79" stopColor="#b46578"/><stop offset="1" stopColor="#7f384e"/></linearGradient>
        <pattern id="parcel-weft" width="1.8" height="2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-21)"><path d="M0 .4h1.25" stroke="#fff1dd" strokeOpacity=".35" strokeWidth=".44" /></pattern>
      </defs>
      <g transform="rotate(-7 186 80)" className="parcel-wrap">
        {([-1, 1] as const).map(side => <g key={side}>
          <path data-band="" id={`parcel-band-${side}`} d={bandPath(side, 0)} />
          <use href={`#parcel-band-${side}`} stroke="#76533a" strokeOpacity=".15" strokeWidth="34" transform="translate(0 2)" />
          <use href={`#parcel-band-${side}`} stroke="#7f4053" strokeWidth="33" />
          <use href={`#parcel-band-${side}`} stroke="url(#parcel-band-face)" strokeWidth="31" />
          <use href={`#parcel-band-${side}`} stroke="#edc4c2" strokeOpacity=".45" strokeWidth=".8" strokeDasharray="3 2" transform="translate(0 12)" />
        </g>)}
      </g>
      {cloth.map(({ id, face, shape, selvedge }) => <g key={id} data-piece={id}>
        <path id={`parcel-${id}-shape`} d={shape} />
        <use href={`#parcel-${id}-shape`} fill={`url(#parcel-${id === 'left-tail' ? 'silk' : face})`} stroke="#743a4b" strokeWidth=".85" />
        <use href={`#parcel-${id}-shape`} fill="url(#parcel-weft)" />
        <path d={selvedge} stroke="#f2bdc0" strokeWidth=".85" opacity=".79" />
      </g>)}
    </svg>
  )
}
