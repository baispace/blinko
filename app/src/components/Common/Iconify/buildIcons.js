/**
 * Simplified icon build script
 * Scans the project for used icons and extracts them from the Iconify library
 */
import fs from 'fs';
import path from 'path';
import { iconToSVG } from '@iconify/utils';

// Always include these icons even if they're not detected by scanning
const ALWAYS_INCLUDE_ICONS = [
  // Icons used in functions or conditional returns that might be hard to detect
  'lets-icons:check-fill',
  'ci:radio-unchecked',
  'ri:indeterminate-circle-line',
  'hugeicons:ai-chemistry-02',
  // Icons from baseStore.ts
  'basil:lightning-outline',
  'basil:expand-outline',
  'grommet-icons:form-view',
  'tabler:source-code',
  'hugeicons:note',
  'hugeicons:analytics-01',
  'solar:database-linear',
  'solar:box-broken',
  'hugeicons:delete-02',
  'hugeicons:plug-socket',
  'hugeicons:settings-01',
  'mingcute:hashtag-line',
  // 品牌 / 关键图标兜底（确保即使扫描遗漏也一定打包，避免回退外部 API）
  'logos:google',
  'logos:spotify',
  'logos:discord',
  'logos:slack',
  'logos:facebook',
  'logos:twitch',
  'cib:line',
  'simple-icons:coinbase',
  'hugeicons:mcp-server',
  'mdi:tune'
];

// Recursively scan directories for files
function scanDirectory(dir, fileExtensions, result = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      scanDirectory(fullPath, fileExtensions, result);
    } else if (fileExtensions.includes(path.extname(file))) {
      // If file extension matches, add file to results
      result.push(fullPath);
    }
  }
  
  return result;
}

// Scan project for used icons
function scanProjectIcons() {
  try {
    console.log('Scanning project for icons...');
    
    // Scan all tsx and jsx files in the src directory
    const srcPath = path.join(__dirname, '..', '..', '..', '..');
    const files = scanDirectory(path.join(srcPath, 'src'), ['.tsx', '.jsx', '.ts']);
    
    // Extract icon names
    // 1. Match JSX attributes: icon="collection:name-with-hyphen" or icon='collection:name-with-hyphen'
    const jsxIconRegex = /icon=["']([a-zA-Z0-9_-]+:[a-zA-Z0-9_\-\.]+)["']/g;
    // 2. Match JS/TS object properties: icon: "collection:name-with-hyphen" or icon: 'collection:name-with-hyphen'
    const jsIconRegex = /icon:\s*["']([a-zA-Z0-9_-]+:[a-zA-Z0-9_\-\.]+)["']/g;
    // 3. Loose match: any "collection:name" string literal.
    //    The two patterns above only catch `icon="..."` / `icon: "..."`; they miss
    //    ternaries (`icon={cond ? 'mdi:chevron-left' : 'mdi:chevron-right'}`),
    //    arrays, lookup tables and other indirection — which silently produced
    //    empty icons at runtime. We accept a literal only when its prefix is a
    //    real Iconify collection, so URLs / CSS values are not swallowed.
    const looseIconRegex = /["']([a-zA-Z0-9_-]+):([a-zA-Z0-9_\-\.]+)["']/g;
    const collectionExistsCache = new Map();
    const collectionExists = (prefix) => {
      if (!collectionExistsCache.has(prefix)) {
        let ok = false;
        try { require.resolve(`@iconify/json/json/${prefix}.json`); ok = true; } catch { ok = false; }
        collectionExistsCache.set(prefix, ok);
      }
      return collectionExistsCache.get(prefix);
    };

    const iconMatches = [];
    
    // Iterate through all files
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      
      // Scan for JSX icon attributes
      while ((match = jsxIconRegex.exec(content)) !== null) {
        iconMatches.push(match[1]);
      }
      
      // Scan for JS/TS object icon properties
      while ((match = jsIconRegex.exec(content)) !== null) {
        iconMatches.push(match[1]);
      }

      // Scan for icon names written outside a strict `icon=` / `icon:` context
      while ((match = looseIconRegex.exec(content)) !== null) {
        if (collectionExists(match[1])) {
          iconMatches.push(`${match[1]}:${match[2]}`);
        }
      }
    }
    
    console.log(`Found ${iconMatches.length} icon usage instances`);
    
    // Add always-include icons
    ALWAYS_INCLUDE_ICONS.forEach(iconName => {
      if (!iconMatches.includes(iconName)) {
        iconMatches.push(iconName);
      }
    });
    
    console.log(`Total icons including defaults: ${iconMatches.length}`);
    
    // Group icons by collection
    const iconsByCollection = {};
    
    iconMatches.forEach(iconName => {
      const [collection, name] = iconName.split(':');
      if (!collection || !name) return;
      
      if (!iconsByCollection[collection]) {
        iconsByCollection[collection] = new Set();
      }
      
      iconsByCollection[collection].add(name);
    });
    
    return iconsByCollection;
  } catch (error) {
    console.error('Error scanning project icons:', error);
    return {};
  }
}

// Extract icons from Iconify
async function extractIcons() {
  // Get icons used in the project
  const iconsByCollection = scanProjectIcons();
  
  let output = `// This file is auto-generated by buildIcons.js
import * as React from 'react';
import { iconToSVG } from '@iconify/utils';
// 本地优先：未命中本地图标时直接渲染空，不回源外部 API (api.iconify.design)

// Define icon collection interface
export interface IconCollection {
  prefix?: string;
  icons?: Record<string, {
    body: string;
    width?: number;
    height?: number;
    hidden?: boolean;
  }>;
  width?: number;
  height?: number;
}
`;

  // First define all icon collections
  for (const [collection, icons] of Object.entries(iconsByCollection)) {
    try {
      console.log(`Processing collection ${collection} with ${icons.size} icons...`);
      
      // Load icon data from Iconify JSON
      try {
        const fullIconsPath = require.resolve(`@iconify/json/json/${collection}.json`);
        const iconsData = JSON.parse(fs.readFileSync(fullIconsPath, 'utf8'));
        
        // Create a new icon data object
        const iconSet = {
          prefix: iconsData.prefix || collection,
          icons: {},
          width: iconsData.width || 24,
          height: iconsData.height || 24
        };
        
        // Add required icons (resolves Iconify aliases too)
        const resolveIcon = (name) => {
          if (iconsData.icons && iconsData.icons[name]) return iconsData.icons[name];
          if (iconsData.aliases && iconsData.aliases[name]) {
            let alias = iconsData.aliases[name];
            let guard = 0;
            while (alias && guard++ < 20) {
              if (iconsData.icons && iconsData.icons[alias.parent]) return iconsData.icons[alias.parent];
              if (iconsData.aliases && iconsData.aliases[alias.parent]) { alias = iconsData.aliases[alias.parent]; }
              else break;
            }
          }
          return null;
        };
        for (const iconName of icons) {
          const body = resolveIcon(iconName);
          if (body) {
            iconSet.icons[iconName] = body;
          } else {
            console.warn(`Icon "${iconName}" not found in "${collection}" collection`);
          }
        }
        
        // Export collection data
        const variableName = collection.replace(/-/g, '_');
        
        output += `
// ${collection} icon collection
export const ${variableName}: IconCollection = ${JSON.stringify(iconSet, null, 2)};
`;
      } catch (err) {
        console.error(`Could not load icon collection ${collection}:`, err.message);
      }
    } catch (error) {
      console.error(`Error processing collection ${collection}:`, error);
    }
  }
  
  // Add Icon component code
  output += `
// Icon component Props interface
interface IconProps {
  icon: string;
  width?: number | string;
  height?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
}

// Parse collection and icon name from icon name
const parseIconName = (iconName: string): { prefix: string; name: string } => {
  const parts = iconName.split(':');
  if (parts.length < 2) {
    return { prefix: '', name: iconName };
  }
  return { prefix: parts[0] || '', name: parts.slice(1).join(':') };
};

// Get icon data
const getIconData = (iconName: string) => {
  const { prefix, name } = parseIconName(iconName);
  const collectionKey = prefix.replace(/-/g, '_') as keyof typeof collections;
  
  // All icon collections
  const collections = {
${Object.keys(iconsByCollection).map(c => `    ${c.replace(/-/g, '_')},`).join('\n')}
  };
  
  const collection = collections[collectionKey];
  
  if (!collection || !collection.icons || !collection.icons[name]) {
    console.warn(\`Icon "\${name}" not found in "\${prefix}" collection\`);
    return null;
  }
  
  return {
    body: collection.icons[name].body,
    width: collection.icons[name].width || collection.width || 16,
    height: collection.icons[name].height || collection.height || 16,
  };
};

// Icon component
// 必须用 forwardRef：HeroUI 的 Tooltip / Badge / Popover 等会给子元素挂 ref，
// 函数组件不转发 ref 会触发 React 告警，且触发器定位失效（tooltip 位置偏移）。
export const Icon = React.forwardRef<SVGSVGElement, IconProps>(({ 
  icon, 
  width = 24, 
  height = 24, 
  color, 
  className = '', 
  style = {},
  onClick 
}, ref) => {
  // Return null if icon name is empty
  if (!icon) return null;
  
  // Get icon data
  const iconData = getIconData(icon);
  
  // 本地图标未命中：直接返回空（不回源外部 API，保证零外部请求）
  if (!iconData) {
    console.warn(\`Local icon not found: \${icon}\`);
    return null;
  }
  
  // Generate SVG from icon data
  const renderData = iconToSVG(iconData, {
    width: typeof width === 'number' ? width.toString() : width || '24',
    height: typeof height === 'number' ? height.toString() : height || '24',
  });
  
  // Build SVG attributes
  const svgAttributes = {
    width,
    height,
    viewBox: renderData.attributes.viewBox,
    className,
    style: {
      ...style,
      color: color
    },
    dangerouslySetInnerHTML: { __html: renderData.body },
    onClick,
  };
  
  // Render SVG
  return <svg {...svgAttributes} ref={ref} />;
});

Icon.displayName = 'Icon';

export default Icon;
`;

  // Save file
  fs.writeFileSync(path.join(__dirname, 'icons.tsx'), output);
  console.log('Icons file generated successfully!');
}

// Execute extraction
extractIcons(); 