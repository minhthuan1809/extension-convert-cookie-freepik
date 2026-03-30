# Tien Ich Chuyen Doi Tai Khoan Bang Cookie

Tien ich Chrome de luu nhieu ho so cookie va chuyen doi tai khoan nhanh.

## Tinh nang

- Luu ho so tu dinh dang JSON cookie (`{ "url": "...", "cookies": [...] }`)
- Lay cookie tu domain cua tab dang mo
- Nhap ho so tu file JSON
- Xuat moi ho so da luu ra JSON
- Chuyen tai khoan bang cach thay cookie theo domain cua ho so

## Cai dat (Che do nha phat trien)

1. Mo `chrome://extensions/`
2. Bat **Developer mode**
3. Bam **Load unpacked**
4. Chon thu muc `cookie-switcher-extension`

## Cach dung

1. Bam vao bieu tuong extension
2. Tao ho so:
   - Nhap ten ho so
   - Dan JSON cookie
   - Bam **Luu ho so**
3. Hoac bam **Lay cookie tu tab hien tai** de dien JSON tu dong
4. Trong **Danh sach ho so da luu**, bam **Chuyen sang tai khoan nay** de ap dung cookie

## Vi du dinh dang JSON

```json
{
  "url": "https://www.freepik.com",
  "cookies": [
    {
      "domain": ".freepik.com",
      "name": "example_cookie",
      "value": "example_value",
      "path": "/",
      "secure": true,
      "httpOnly": false,
      "sameSite": "lax",
      "session": false,
      "expirationDate": 1893456000
    }
  ]
}
```

## Luu y

- Chi su dung voi tai khoan ban so huu hoac duoc cap quyen quan ly.
- Mot so website co the vo hieu hoa phien dang nhap khi cookie thay doi bat thuong.
