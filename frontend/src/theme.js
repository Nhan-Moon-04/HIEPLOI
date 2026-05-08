import { theme } from 'antd';

export function getThemeConfig(mode = 'light', primaryColor = '#4361ee') {
  const isLight = mode === 'light';

  return {
    algorithm: isLight ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: primaryColor,
      colorBgContainer: isLight ? '#ffffff' : '#1a1f2e',
      colorBgElevated: isLight ? '#ffffff' : '#232838',
      colorBgLayout: isLight ? '#f0f2f5' : '#111521',
      colorBorder: isLight ? '#e8ecf1' : 'rgba(255,255,255,0.08)',
      colorBorderSecondary: isLight ? '#f0f0f0' : 'rgba(255,255,255,0.06)',
      colorText: isLight ? '#1a2233' : '#e2e8f0',
      colorTextSecondary: isLight ? '#6b7a99' : '#94a3b8',
      colorTextTertiary: isLight ? '#9ba8bf' : '#64748b',
      borderRadius: 8,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 13,
      colorSuccess: '#22c55e',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',
      colorInfo: '#3b82f6',
      controlHeight: 36,
    },
    components: {
      Menu: {
        itemBorderRadius: 6,
        itemMarginInline: 8,
        itemHeight: 36,
        iconSize: 16,
        ...(isLight
          ? {
              darkItemBg: 'transparent',
              darkItemSelectedBg: 'rgba(255,255,255,0.15)',
              darkItemColor: 'rgba(255,255,255,0.75)',
              darkItemSelectedColor: '#ffffff',
              darkItemHoverColor: '#ffffff',
              darkItemHoverBg: 'rgba(255,255,255,0.08)',
            }
          : {}),
      },
      Table: {
        headerBg: isLight ? '#f8f9fc' : '#1a1f2e',
        headerColor: isLight ? '#6b7a99' : '#94a3b8',
        rowHoverBg: isLight ? '#f5f7ff' : 'rgba(67,97,238,0.06)',
        borderColor: isLight ? '#f0f0f0' : 'rgba(255,255,255,0.06)',
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
        headerSplitColor: isLight ? '#f0f0f0' : 'rgba(255,255,255,0.06)',
      },
      Button: {
        borderRadius: 6,
        controlHeight: 34,
      },
      Input: {
        controlHeight: 34,
      },
      Select: {
        controlHeight: 34,
      },
      Modal: {
        contentBg: isLight ? '#ffffff' : '#1a1f2e',
        headerBg: isLight ? '#ffffff' : '#1a1f2e',
      },
      Card: {
        colorBgContainer: isLight ? '#ffffff' : '#1a1f2e',
      },
    },
  };
}
