/**
 * USDZ writer for AR Quick Look (iPhone, iPad, Vision Pro) and other USD tools.
 *
 * A .usdz is an uncompressed ZIP whose first file is the USD layer and whose
 * file data starts on 64-byte boundaries. The layer is plain text (.usda):
 * one mesh in millimetres (metersPerUnit = 0.001, so AR shows it at real size),
 * Y up, smooth normals, and one UsdPreviewSurface material per colour of the
 * shapes, bound to GeomSubsets of faces. Quick Look honours materials but not
 * vertex colours, so colours are grouped the same way as in 3MF.
 */
import { CREDIT, SITE } from './writers';
import { trianglePalette } from './threemf';
import { writeZip } from './zip';

export interface UsdzOptions {
  title: string;
  /** per-vertex sRGB colours 0..1 */
  colors: Float32Array;
  /** the shapes' own colours (sRGB) to snap to */
  palette?: [number, number, number][] | null;
  roughness: number;
  metallic: number;
}

/** compact number: 3 decimals (1 µm for millimetre positions), no trailing zeros */
const f = (v: number) => {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0' : s.replace(/\.?0+$/, '');
};
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=\d)/, '_') || 'Shape';
const str = (s: string) => JSON.stringify(s); // a valid USD string literal for plain text

/** The .usda layer. Positions in millimetres, Y up; normals unit length. */
export function usdaLayer(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  opts: UsdzOptions,
): string {
  const nt = indices.length / 3;
  const pal = trianglePalette(opts.colors, indices, 16, opts.palette);
  let lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  const pts: string[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    pts.push(`(${f(positions[i])},${f(positions[i + 1])},${f(positions[i + 2])})`);
    lo = lo.map((v, k) => Math.min(v, positions[i + k]));
    hi = hi.map((v, k) => Math.max(v, positions[i + k]));
  }
  const nrm: string[] = [];
  for (let i = 0; i < normals.length; i += 3)
    nrm.push(`(${f(normals[i])},${f(normals[i + 1])},${f(normals[i + 2])})`);
  const subsets: string[] = [];
  const materials: string[] = [];
  pal.palette.forEach((c, k) => {
    const faces: number[] = [];
    for (let t = 0; t < nt; t++) if (pal.tri[t] === k) faces.push(t);
    const name = `Colour${k + 1}`;
    subsets.push(`
        def GeomSubset "${name}" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
            uniform token elementType = "face"
            uniform token familyName = "materialBind"
            int[] indices = [${faces.join(',')}]
            rel material:binding = </Root/Materials/${name}>
        }`);
    const lin = c.map(toLinear);
    materials.push(`
        def Material "${name}"
        {
            token outputs:surface.connect = </Root/Materials/${name}/Surface.outputs:surface>

            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (${f(lin[0])}, ${f(lin[1])}, ${f(lin[2])})
                float inputs:roughness = ${f(opts.roughness)}
                float inputs:metallic = ${f(opts.metallic)}
                token outputs:surface
            }
        }`);
  });
  const shape = ident(opts.title);
  return `#usda 1.0
(
    customLayerData = {
        string creator = ${str(`${CREDIT} (${SITE})`)}
    }
    defaultPrim = "Root"
    doc = ${str(`${opts.title} - made with ${CREDIT}`)}
    metersPerUnit = 0.001
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = ${str(opts.title)}
    }
    kind = "component"
)
{
    def Mesh "${shape}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [(${lo.map(f).join(', ')}), (${hi.map(f).join(', ')})]
        int[] faceVertexCounts = [${new Array(nt).fill(3).join(',')}]
        int[] faceVertexIndices = [${Array.from(indices).join(',')}]
        point3f[] points = [${pts.join(',')}]
        normal3f[] normals = [${nrm.join(',')}] (
            interpolation = "vertex"
        )
        uniform token orientation = "rightHanded"
        uniform token subdivisionScheme = "none"
        uniform token subsetFamily:materialBind:familyType = "partition"
${subsets.join('\n')}
    }

    def Scope "Materials"
    {${materials.join('\n')}
    }
}
`;
}

/** A complete .usdz package (layer first, 64-byte aligned, uncompressed). */
export async function writeUSDZ(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  opts: UsdzOptions,
): Promise<ArrayBuffer> {
  const layer = new TextEncoder().encode(usdaLayer(positions, normals, indices, opts));
  return writeZip([{ name: 'model.usda', data: layer, align: 64 }]);
}
