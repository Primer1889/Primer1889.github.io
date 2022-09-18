const ap = new APlayer({
    container: document.getElementById('aplayer'),
    fixed: true,
    autoplay: false,
    audio: [
      {
        name: "China-Y",
        artist: '徐梦圆',
        url: 'https://www.xzmp3.com/down/77f0b34e1432.mp3',
        cover: 'https://img1.imgtp.com/2022/09/18/ykxBDTnB.png',
      },
      {
        name: 'China-X',
        artist: '徐梦圆',
        url: 'https://www.ytmp3.cn/down/49003.mp3',
        cover: 'https://img1.imgtp.com/2022/09/18/ykxBDTnB.png',
      },
    ]
});