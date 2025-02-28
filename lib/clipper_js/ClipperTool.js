import {circlesToVerts, vertsToCircles} from "../../src/3d/util/ToolMethods.js";
import ClipperLib from "clipper_js";

const clipper = new ClipperLib.Clipper()
// const clipperOffset = new ClipperOffset()
const clipperOffset = new ClipperLib.ClipperOffset(2, 0.25)
const scale = 1000;
const minimum = 1.0 / scale
function equals(pt0, pt1, notPrecise = true) {
  if (pt0 === pt1) {
    return true
  }
  if (notPrecise) {
    return Math.abs(pt0.x - pt1.x) <= minimum && Math.abs(pt0.y - pt1.y) <= minimum
  }
  return pt0.x === pt1.x && pt0.y === pt1.y
}

function circlesToClipPaths(verticesHoles, scalar = 1) {
  const paths = []
  const circles = vertsToCircles(verticesHoles)
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i]
    const path = []
    for (let j = 0; j < circle.length; j++) {
      const pt = circle[j]
      const pt2 = {X: pt.x, Y: pt.y}
      if (scalar > 1) {
        pt2.X = Math.round(pt2.X * scalar)
        pt2.Y = Math.round(pt2.Y * scalar)
      }
      path.push(pt2)
    }
    paths.push(path)
  }
  return paths
}
// 从多边形树中，提取出若干个 可能带孔的二维图形
function extractCirclesArrFrom(polygonTree, circlesArr = []) {
  const nextPolygonTrees = []
  for (let i = 0; i < polygonTree.m_Childs.length; i++) {
    const child = polygonTree.m_Childs[i]
    const contour = child.m_polygon.map(it => {
      return {x: it.X / scale, y: it.Y / scale}
    })
    const circles = [contour]
    for (let j = 0; j < child.m_Childs.length; j++) {
      const subChild = child.m_Childs[j]
      const hole = subChild.m_polygon.map(it => {
        return {x: it.X / scale, y: it.Y / scale}
      })
      circles.push(hole)
      if (subChild.m_Childs.length) {
        const polyTree = new ClipperLib.PolyTree()
        polyTree.m_Childs = subChild.m_Childs
        nextPolygonTrees.push(polyTree)
      }
    }
    circlesArr.push(circles)
  }
  nextPolygonTrees.forEach(polyTree => extractCirclesArrFrom(polyTree, circlesArr))
  return circlesArr
}

/**
 * 对多个verticesHolesArr中的二维带孔图形进行合并
 * @param {{x: number, y: number}[][]} verticesHolesArr 最外轮廓是逆时针序列，孔是顺时针序列
 * @return {*[]} 返回三维数组，其中每个二维数组的结构和输入参数一致
 */
function boolPolygons(verticesHolesArr, clipType) {
  const allPaths = []
  const pathsA = []
  for (let i = 0; i < verticesHolesArr.length; i++) {
    const verticesHoles = verticesHolesArr[i]
    const paths = circlesToClipPaths(verticesHoles)
    allPaths.push(...paths)
    if (i === 0) {
      pathsA.push(...paths)
    }
  }
  ClipperLib.JS.ScaleUpPaths(allPaths, scale);
  clipper.Clear()
  for (let i = 0; i < allPaths.length; i++) {
    // const polyType = i === 0 ? ClipperLib.PolyType.ptSubject : ClipperLib.PolyType.ptClip
    const polyType = pathsA.includes(allPaths[i]) ? ClipperLib.PolyType.ptSubject : ClipperLib.PolyType.ptClip
    clipper.AddPath(allPaths[i], polyType, true);
  }
  const solutionTree = new ClipperLib.PolyTree();
  const fillType = ClipperLib.PolyFillType.pftNonZero
  clipper.Execute(clipType, solutionTree, fillType, fillType);
  const circlesArr = extractCirclesArrFrom(solutionTree)
  const r = circlesArr.map(circles => circlesToVerts(circles))
  return r
}

export default class ClipperTool {
  static _jtType = ClipperLib.JoinType.jtMiter
  static _etOpenType = ClipperLib.EndType.etOpenButt
  static getJtType() {
    return ClipperTool._jtType
  }
  static setJtType(value) {
    ClipperTool._jtType = value
  }
  static getEtOpenType() {
    return ClipperTool._etOpenType
  }
  static setEtOpenType(value) {
    ClipperTool._etOpenType = value
  }
  /**
   * @param {{x: number, y: number}[][]} path
   * @param {number} offset
   * @param {boolean} closed,  true表示路径是闭合的
   * @return {{x: number, y: number}[][][]}
   */
  static offsetPolygon(polygon, offset, closed = true) {
    clipperOffset.Clear()
    const path = []
    const round = Math.round
    polygon.forEach(arr => {
      const list = []
      arr.forEach(pt => {
        list.push({X: round(pt.x * scale), Y: round(pt.y * scale)})
      })
      path.push(list)
    })
    // console.log(JSON.stringify(path))
    const et = closed ? ClipperLib.EndType.etClosedPolygon : ClipperTool._etOpenType
    clipperOffset.AddPaths(path, ClipperTool._jtType, et)
    const solutionTree = new ClipperLib.PolyTree();
    clipperOffset.Execute(solutionTree, round(offset * scale))
    const circlesArr = extractCirclesArrFrom(solutionTree)
    return circlesArr
  }

  /**
   * 对切割路径进行1个单位的膨胀，从线段膨胀为二维区域
   * @param {{x: number, y: number}[][][]} slicePathsArr 切割路径
   * @param {number[][]} closingArr 每段切割路径 对应的闭合属性
   * @return {{x: number, y: number}[][][]}
   */
  static expandSlicePaths(slicePathsArr, closingArr) {
    clipperOffset.Clear()
    const round = Math.round
    slicePathsArr.forEach((arr2, index) => {
      const closing = closingArr[index]
      const etType = !!closing[0] ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenButt
      const paths = []
      arr2.forEach(arr => {
        const list = []
        arr.forEach(pt => {
          list.push({X: round(pt.x * scale), Y: round(pt.y * scale)})
        })
        paths.push(list)
      })
      // 注意：使用 ClipperLib.JoinType.jtMiter，并且偏移距离为 1 时，可能出现bug；这里为了稳定性使用 jtRound
      clipperOffset.AddPaths(paths, ClipperLib.JoinType.jtRound, etType)
    })
    const expandPaths = new ClipperLib.Paths();
    clipperOffset.Execute(expandPaths, 1)
    return expandPaths
  }
  /**
   * 注意：调用此方法前，必须确保输入的所有顶点都位于一个统一的坐标系中
   * @param {[{x: number, y: number}[], number[] (孔的起始顶点索引)]} verticesHoles 最外轮廓是逆时针序列，孔是顺时针序列
   * 每个元素的结构类似于 [[v0, v1, v3, v4, v5, m0, m1, m2, n0, n1, n2, n3], [6, 9]]
   * @param {{x: number, y: number}[][][]} expandedSlicePaths
   * @return {[{x: number, y: number}[], number[] (孔的起始顶点索引)][]}
   */
  static slicePolygon(verticesHoles, expandedSlicePaths) {
    clipper.Clear()
    const paths = circlesToClipPaths(verticesHoles, scale)
    for (let i = 0; i < paths.length; i++) {
      // const polyType = i === 0 ? ClipperLib.PolyType.ptSubject : ClipperLib.PolyType.ptClip
      clipper.AddPath(paths[i], ClipperLib.PolyType.ptSubject, true);
    }
    for (let i = 0; i < expandedSlicePaths.length; i++) {
      clipper.AddPath(expandedSlicePaths[i], ClipperLib.PolyType.ptClip, true);
    }
    const solutionTree = new ClipperLib.PolyTree();
    const fillType = ClipperLib.PolyFillType.pftNonZero
    clipper.Execute(ClipperLib.ClipType.ctDifference, solutionTree, fillType, fillType);
    const circlesArr = extractCirclesArrFrom(solutionTree)
    const r = circlesArr.map(circles => circlesToVerts(circles))
    return r
  }

  /**
   * @param {{x: number, y: number}} point
   * @param {{x: number, y: number}[][]} path
   * @return {boolean} true point在以contour为轮廓的凸多边形中
   */
  static pointInPolygon(point, path) {
    const pt = {X: point.x, Y: point.y}
    const contour = path.map(arr => {
        return arr.map(it => {
          return {X: it.x, Y: it.y}
        })
      }
    )
    for (let i = 0; i < contour.length; i++) {
      const flag = ClipperLib.Clipper.PointInPolygon(pt, contour[i])
      const inside = flag === 1
      const outside = flag === 0
      const onEdge = flag === -1
      if (i === 0 && (outside || onEdge)) {
        return false
      }
      if (i > 0 && inside) {
        // 点 在带孔图形的某个孔洞中
        return false
      }
    }
    return true
  }
  /**
   * @param {{x: number, y: number}[]} contourA
   * @param {{x: number, y: number}[]} contourB
   * @return {boolean} true 轮廓B 完全被 轮廓A 包含
   */
  static contourAcontainsB(contourA, contourB) {
    const a = contourA.map(it => {
      return {X: it.x, Y: it.y}
    })
    const b = contourB.map(it => {
      return {X: it.x, Y: it.y}
    })
    for (let i = 0; i < b.length; i++) {
      const flag = ClipperLib.Clipper.PointInPolygon(b[i], a)
      // const inside = flag === 1
      // const onEdge = flag === -1
      const outside = flag === 0
      if (outside) {
        return false
      }
    }
    return true
  }
  static equalPolygons(polygonA, polygonB) {
    const [aVerts, aIndices] = polygonA
    const [bVerts, bIndices] = polygonB
    if (aVerts.length !== bVerts.length || aIndices.length !== bIndices.length) {
      return false
    }
    for (let i = 0; i < aVerts.length; i++) {
      const a = aVerts[i]
      const b = bVerts[i]
      if (!equals(a, b)) {
        return false
      }
    }
    for (let i = 0; i < aIndices.length; i++) {
      if (aIndices[i] !== bIndices[i]) {
        return false
      }
    }
    return true
  }
  static isPolygonAintersectsB(verticesHolesA, verticesHolesB) {
    const pathsA = circlesToClipPaths(verticesHolesA)
    const pathsB = circlesToClipPaths(verticesHolesB)
    ClipperLib.JS.ScaleUpPaths(pathsA, scale);
    ClipperLib.JS.ScaleUpPaths(pathsB, scale);
    clipper.Clear()
    clipper.AddPaths(pathsA, ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(pathsB, ClipperLib.PolyType.ptClip, true);
    const solutionPath = [];
    const fillType = ClipperLib.PolyFillType.pftNonZero
    clipper.Execute(ClipperLib.ClipType.ctIntersection, solutionPath, fillType, fillType);
    return solutionPath.length && solutionPath[0].length > 2
  }
  /**
   * 对多个verticesHolesArr中的二维带孔图形进行合并
   * @param {{x: number, y: number}[][]} verticesHolesArr 最外轮廓是逆时针序列，孔是顺时针序列
   * @return {*[]} 返回三维数组，其中每个二维数组的结构和输入参数一致
   */
  static polygonsMerge(verticesHolesArr) {
    return boolPolygons(verticesHolesArr, ClipperLib.ClipType.ctUnion)
  }
  static polygonsIntersect(verticesHolesArr) {
    return boolPolygons(verticesHolesArr, ClipperLib.ClipType.ctIntersection)
  }

  /**
   * @param {{x: number, y: number}[][]} verticesHolesArr 最外轮廓是逆时针序列，孔是顺时针序列
   * @param {string} clipType
   * @see ClipperLib.ClipType
   * @return {*[]}
   */
  static polygonsBoolean(verticesHolesArr, clipType) {
    return boolPolygons(verticesHolesArr, clipType)
  }
  /**
   * 对多个verticesHolesArr中的二维带孔图形进行差集运算，第一个图形做为被减对象
   * @param {{x: number, y: number}[][]} verticesHolesArr 最外轮廓是逆时针序列，孔是顺时针序列
   * @return {*[]} 返回三维数组，其中每个二维数组的结构和输入参数一致
   */
  static polygonsSub(verticesHolesArr) {
    return boolPolygons(verticesHolesArr, ClipperLib.ClipType.ctDifference)
  }
  static polygonsXor(verticesHolesArr) {
    return boolPolygons(verticesHolesArr, ClipperLib.ClipType.ctXor)
  }

}
