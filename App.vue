<script>
import { resetHomeCache } from './utils/homeCache'
import { checkH5Update } from './utils/updateCheck'

export default {
  onLaunch() {
    resetHomeCache()
    // #ifdef H5
    setTimeout(() => {
      checkH5Update()
    }, 600)
    // #endif
    // #ifdef APP-PLUS
    setTimeout(() => {
      try {
        plus.navigator.closeSplashscreen()
      } catch (e) {}
    }, 0)
    // #endif
  },
  onShow() {},
  onHide() {}
}
</script>

<style>
page {
  background: #f4efe9;
  color: #2d1616;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    'Noto Sans SC',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

view,
text,
input,
textarea,
button,
scroll-view,
image {
  box-sizing: border-box;
}

button::after {
  border: none;
}

button {
  font-family: inherit;
}

input,
textarea {
  font-family: inherit;
}

/* H5 桌面端：页面底色铺满，内容由各页 max-width 控制 */
@media screen and (min-width: 768px) {
  body {
    background: #efe8e0;
  }
}
</style>
